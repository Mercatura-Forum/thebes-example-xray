import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import List "mo:core/List";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Admin "mo:thebes-lib/Admin";
import Pagination "mo:thebes-lib/Pagination";

// Lumen — on-chain medical imaging.
//
// Models the DICOM/FHIR entity hierarchy — Patient → ImagingStudy → Series →
// Image — without the binary DICOM wire format. Image *bytes* never live here:
// they go to the Thebes media contract, and a study Image holds only the stored
// media path (the storage law — this contract holds pointers, not pixels).
//
// Roles (clinical RBAC, on top of lib/Admin's owner+admin tiers):
//   • technician  — registers patients, creates studies/series, uploads images
//   • radiologist — writes and finalizes diagnostic reports
//   • referrer    — read-only access to assigned worklist
// The owner/admin tier may do everything and assigns the clinical roles. Patient
// records are visible only to staff (anyone with a clinical role, or an admin);
// every opened study appends to an immutable access log — the privacy surface.
persistent actor Lumen {

  // ── Standard admin surface (lib/Admin) ──
  // The hospital/clinic operator claims ownership; the owner grants the `admin`
  // tier to department leads and assigns clinical roles below.
  var admin = Admin.init();

  public shared(msg) func claimOwner() : async Bool { Admin.claimOwner(admin, msg.caller) };
  public shared(msg) func transferOwner(n : Principal) : async Bool { Admin.transferOwner(admin, msg.caller, n) };
  public shared(msg) func addAdmin(w : Principal) : async Bool { Admin.addAdmin(admin, msg.caller, w) };
  public shared(msg) func removeAdmin(w : Principal) : async Bool { Admin.removeAdmin(admin, msg.caller, w) };
  public shared(msg) func setPaused(v : Bool) : async Bool { Admin.setPaused(admin, msg.caller, v) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };
  public query func getAdmins() : async [Principal] { Admin.getAdmins(admin) };
  public query func isPaused() : async Bool { Admin.isPaused(admin) };

  // ── Clinical roles ──
  type Role = { #technician; #radiologist; #referrer };
  var roles : Map.Map<Principal, Role> = Map.empty<Principal, Role>();

  func roleFromText(t : Text) : ?Role {
    switch t {
      case ("technician") ?#technician;
      case ("radiologist") ?#radiologist;
      case ("referrer") ?#referrer;
      case (_) null;
    };
  };
  func roleText(r : Role) : Text {
    switch r { case (#technician) "technician"; case (#radiologist) "radiologist"; case (#referrer) "referrer" };
  };

  // Capability checks. The admin tier (owner + admins) supersedes every clinical
  // capability; clinical roles grant their specific duty.
  func hasRole(p : Principal, want : Role) : Bool {
    switch (Map.get(roles, Principal.compare, p)) { case (?r) r == want; case null false };
  };
  func canAcquire(p : Principal) : Bool { Admin.isAdmin(admin, p) or hasRole(p, #technician) };
  func canReport(p : Principal) : Bool { Admin.isAdmin(admin, p) or hasRole(p, #radiologist) };
  func isStaff(p : Principal) : Bool {
    Admin.isAdmin(admin, p) or (switch (Map.get(roles, Principal.compare, p)) { case (?_) true; case null false });
  };

  func doAssignRole(caller : Principal, who : Principal, role : Text) : Result.Result<(), Text> {
    if (not Admin.isAdmin(admin, caller)) { return #err("Only an admin may assign roles") };
    switch (roleFromText(role)) {
      case null { #err("Unknown role (want technician | radiologist | referrer)") };
      case (?r) { Map.add(roles, Principal.compare, who, r); #ok(()) };
    };
  };
  public shared(msg) func assignRole(who : Principal, role : Text) : async Result.Result<(), Text> { doAssignRole(msg.caller, who, role) };
  public shared(msg) func assignRoleOrTrap(who : Principal, role : Text) : async () {
    switch (doAssignRole(msg.caller, who, role)) { case (#ok(())) {}; case (#err(e)) { Runtime.trap(e) } };
  };

  func doRevokeRole(caller : Principal, who : Principal) : Result.Result<(), Text> {
    if (not Admin.isAdmin(admin, caller)) { return #err("Only an admin may revoke roles") };
    ignore Map.delete(roles, Principal.compare, who);
    #ok(());
  };
  public shared(msg) func revokeRole(who : Principal) : async Result.Result<(), Text> { doRevokeRole(msg.caller, who) };
  public shared(msg) func revokeRoleOrTrap(who : Principal) : async () {
    switch (doRevokeRole(msg.caller, who)) { case (#ok(())) {}; case (#err(e)) { Runtime.trap(e) } };
  };

  // The caller's effective role: owner | admin | technician | radiologist | referrer | none.
  // Returned as a 1-element vec<record> (the SDK's single decode path).
  public shared query(msg) func myRole() : async [{ role : Text }] {
    let r =
      if (Admin.isOwner(admin, msg.caller)) "owner"
      else if (Admin.isAdmin(admin, msg.caller)) "admin"
      else switch (Map.get(roles, Principal.compare, msg.caller)) { case (?x) roleText(x); case null "none" };
    [{ role = r }];
  };

  // Assigned clinical staff (admin-only). Owner/admins are queried separately.
  public shared query(msg) func staffView() : async [{ who : Principal; role : Text }] {
    if (not Admin.isAdmin(admin, msg.caller)) return [];
    Array.map<(Principal, Role), { who : Principal; role : Text }>(
      Iter.toArray(Map.entries(roles)),
      func((p, r)) { { who = p; role = roleText(r) } },
    );
  };

  // ── Domain model ──
  type StudyStatus = { #scheduled; #acquired; #reported };
  type ReportStatus = { #preliminary; #final };

  type Patient = { id : Nat; mrn : Text; name : Text; sex : Text; birthYear : Nat; createdAt : Int };
  type Study = {
    id : Nat; patientId : Nat; modality : Text; bodyPart : Text; description : Text;
    status : StudyStatus; createdAt : Int; createdBy : Principal;
  };
  type Series = { id : Nat; studyId : Nat; description : Text; createdAt : Int };
  // An Image holds the media-contract PATH, never bytes. `studyId` is denormalized
  // so a study's images are one scan away.
  type Image = { id : Nat; seriesId : Nat; studyId : Nat; imagePath : Text; instanceNumber : Nat; createdAt : Int };
  type Report = {
    studyId : Nat; findings : Text; impression : Text; status : ReportStatus;
    radiologist : Principal; updatedAt : Int;
  };
  type AccessEvent = { id : Nat; at : Int; who : Principal; studyId : Nat; action : Text };

  var nextPatientId : Nat = 1;
  var nextStudyId : Nat = 1;
  var nextSeriesId : Nat = 1;
  var nextImageId : Nat = 1;
  var nextAccessId : Nat = 1;

  var patients : Map.Map<Nat, Patient> = Map.empty<Nat, Patient>();
  var studies : Map.Map<Nat, Study> = Map.empty<Nat, Study>();
  var series : Map.Map<Nat, Series> = Map.empty<Nat, Series>();
  var images : Map.Map<Nat, Image> = Map.empty<Nat, Image>();
  var reports : Map.Map<Nat, Report> = Map.empty<Nat, Report>();   // keyed by studyId
  var accessLog : Map.Map<Nat, AccessEvent> = Map.empty<Nat, AccessEvent>();

  func statusText(s : StudyStatus) : Text {
    switch s { case (#scheduled) "scheduled"; case (#acquired) "acquired"; case (#reported) "reported" };
  };
  func reportStatusText(rs : ReportStatus) : Text {
    switch rs { case (#preliminary) "preliminary"; case (#final) "final" };
  };
  func reportStatusOf(studyId : Nat) : Text {
    switch (Map.get(reports, Nat.compare, studyId)) { case (?r) reportStatusText(r.status); case null "none" };
  };
  func countWhere<V>(m : Map.Map<Nat, V>, pred : V -> Bool) : Nat {
    var n : Nat = 0;
    for (v in Map.values(m)) { if (pred(v)) n += 1 };
    n;
  };

  // ── Patients (technician/admin) ──
  func addPatientRaw(mrn : Text, name : Text, sex : Text, birthYear : Nat) : Nat {
    let id = nextPatientId; nextPatientId += 1;
    Map.add(patients, Nat.compare, id, { id; mrn; name; sex; birthYear; createdAt = Time.now() });
    id;
  };
  func doAddPatient(caller : Principal, mrn : Text, name : Text, sex : Text, birthYear : Nat) : Result.Result<Nat, Text> {
    Admin.requireNotPaused(admin);
    if (not canAcquire(caller)) { return #err("Not authorized (technician or admin required)") };
    #ok(addPatientRaw(mrn, name, sex, birthYear));
  };
  public shared(msg) func addPatient(mrn : Text, name : Text, sex : Text, birthYear : Nat) : async Result.Result<Nat, Text> {
    doAddPatient(msg.caller, mrn, name, sex, birthYear);
  };
  public shared(msg) func addPatientOrTrap(mrn : Text, name : Text, sex : Text, birthYear : Nat) : async Nat {
    switch (doAddPatient(msg.caller, mrn, name, sex, birthYear)) { case (#ok(id)) id; case (#err(e)) { Runtime.trap(e) } };
  };

  // ── Studies (technician/admin) ──
  func addStudyRaw(caller : Principal, patientId : Nat, modality : Text, bodyPart : Text, description : Text) : Nat {
    let id = nextStudyId; nextStudyId += 1;
    Map.add(studies, Nat.compare, id, {
      id; patientId; modality; bodyPart; description; status = #scheduled; createdAt = Time.now(); createdBy = caller;
    });
    id;
  };
  func doAddStudy(caller : Principal, patientId : Nat, modality : Text, bodyPart : Text, description : Text) : Result.Result<Nat, Text> {
    Admin.requireNotPaused(admin);
    if (not canAcquire(caller)) { return #err("Not authorized (technician or admin required)") };
    switch (Map.get(patients, Nat.compare, patientId)) {
      case null { #err("Unknown patient " # Nat.toText(patientId)) };
      case (?_) { #ok(addStudyRaw(caller, patientId, modality, bodyPart, description)) };
    };
  };
  public shared(msg) func addStudy(patientId : Nat, modality : Text, bodyPart : Text, description : Text) : async Result.Result<Nat, Text> {
    doAddStudy(msg.caller, patientId, modality, bodyPart, description);
  };
  public shared(msg) func addStudyOrTrap(patientId : Nat, modality : Text, bodyPart : Text, description : Text) : async Nat {
    switch (doAddStudy(msg.caller, patientId, modality, bodyPart, description)) { case (#ok(id)) id; case (#err(e)) { Runtime.trap(e) } };
  };

  // ── Series (technician/admin) ──
  func addSeriesRaw(studyId : Nat, description : Text) : Nat {
    let id = nextSeriesId; nextSeriesId += 1;
    Map.add(series, Nat.compare, id, { id; studyId; description; createdAt = Time.now() });
    id;
  };
  func doAddSeries(caller : Principal, studyId : Nat, description : Text) : Result.Result<Nat, Text> {
    Admin.requireNotPaused(admin);
    if (not canAcquire(caller)) { return #err("Not authorized (technician or admin required)") };
    switch (Map.get(studies, Nat.compare, studyId)) {
      case null { #err("Unknown study " # Nat.toText(studyId)) };
      case (?_) { #ok(addSeriesRaw(studyId, description)) };
    };
  };
  public shared(msg) func addSeries(studyId : Nat, description : Text) : async Result.Result<Nat, Text> { doAddSeries(msg.caller, studyId, description) };
  public shared(msg) func addSeriesOrTrap(studyId : Nat, description : Text) : async Nat {
    switch (doAddSeries(msg.caller, studyId, description)) { case (#ok(id)) id; case (#err(e)) { Runtime.trap(e) } };
  };

  // ── Images (technician/admin) ── bytes already uploaded to the media contract;
  // we store the returned path. Acquiring the first image advances the parent
  // study scheduled → acquired (forward-only).
  func addImageRaw(seriesId : Nat, studyId : Nat, imagePath : Text, instanceNumber : Nat) : Nat {
    let id = nextImageId; nextImageId += 1;
    Map.add(images, Nat.compare, id, { id; seriesId; studyId; imagePath; instanceNumber; createdAt = Time.now() });
    switch (Map.get(studies, Nat.compare, studyId)) {
      case (?st) { if (st.status == #scheduled) { Map.add(studies, Nat.compare, studyId, { st with status = #acquired }) } };
      case null {};
    };
    id;
  };
  func doAddImage(caller : Principal, seriesId : Nat, imagePath : Text, instanceNumber : Nat) : Result.Result<Nat, Text> {
    Admin.requireNotPaused(admin);
    if (not canAcquire(caller)) { return #err("Not authorized (technician or admin required)") };
    switch (Map.get(series, Nat.compare, seriesId)) {
      case null { #err("Unknown series " # Nat.toText(seriesId)) };
      case (?s) {
        // Instance numbers order a series — a duplicate would corrupt the
        // stack (and trip the oracle's R5). Rejected at the write.
        for ((_, im) in Map.entries(images)) {
          if (im.seriesId == seriesId and im.instanceNumber == instanceNumber) {
            return #err("Instance " # Nat.toText(instanceNumber) # " already exists in this series");
          };
        };
        #ok(addImageRaw(seriesId, s.studyId, imagePath, instanceNumber));
      };
    };
  };
  public shared(msg) func addImage(seriesId : Nat, imagePath : Text, instanceNumber : Nat) : async Result.Result<Nat, Text> {
    doAddImage(msg.caller, seriesId, imagePath, instanceNumber);
  };
  public shared(msg) func addImageOrTrap(seriesId : Nat, imagePath : Text, instanceNumber : Nat) : async Nat {
    switch (doAddImage(msg.caller, seriesId, imagePath, instanceNumber)) { case (#ok(id)) id; case (#err(e)) { Runtime.trap(e) } };
  };

  // ── Reports (radiologist/admin) ──
  func saveReportRaw(caller : Principal, studyId : Nat, findings : Text, impression : Text) {
    Map.add(reports, Nat.compare, studyId, {
      studyId; findings; impression; status = #preliminary; radiologist = caller; updatedAt = Time.now();
    });
  };
  func doSaveReport(caller : Principal, studyId : Nat, findings : Text, impression : Text) : Result.Result<(), Text> {
    Admin.requireNotPaused(admin);
    if (not canReport(caller)) { return #err("Not authorized (radiologist or admin required)") };
    switch (Map.get(studies, Nat.compare, studyId)) {
      case null { return #err("Unknown study " # Nat.toText(studyId)) };
      case (?st) { if (st.status == #scheduled) { return #err("No images acquired yet — cannot report") } };
    };
    switch (Map.get(reports, Nat.compare, studyId)) {
      case (?r) { if (r.status == #final) { return #err("Report is finalized and cannot be edited") } };
      case null {};
    };
    saveReportRaw(caller, studyId, findings, impression);
    #ok(());
  };
  public shared(msg) func saveReport(studyId : Nat, findings : Text, impression : Text) : async Result.Result<(), Text> {
    doSaveReport(msg.caller, studyId, findings, impression);
  };
  public shared(msg) func saveReportOrTrap(studyId : Nat, findings : Text, impression : Text) : async () {
    switch (doSaveReport(msg.caller, studyId, findings, impression)) { case (#ok(())) {}; case (#err(e)) { Runtime.trap(e) } };
  };

  // Finalize: preliminary → final, and advance the study to reported. Once final,
  // the report is locked (saveReport rejects further edits).
  func doFinalizeReport(caller : Principal, studyId : Nat) : Result.Result<(), Text> {
    Admin.requireNotPaused(admin);
    if (not canReport(caller)) { return #err("Not authorized (radiologist or admin required)") };
    switch (Map.get(reports, Nat.compare, studyId)) {
      case null { #err("No report to finalize") };
      case (?r) {
        if (r.status == #final) { return #err("Report is already final") };
        Map.add(reports, Nat.compare, studyId, { r with status = #final; radiologist = caller; updatedAt = Time.now() });
        switch (Map.get(studies, Nat.compare, studyId)) {
          case (?st) { Map.add(studies, Nat.compare, studyId, { st with status = #reported }) };
          case null {};
        };
        #ok(());
      };
    };
  };
  public shared(msg) func finalizeReport(studyId : Nat) : async Result.Result<(), Text> { doFinalizeReport(msg.caller, studyId) };
  public shared(msg) func finalizeReportOrTrap(studyId : Nat) : async () {
    switch (doFinalizeReport(msg.caller, studyId)) { case (#ok(())) {}; case (#err(e)) { Runtime.trap(e) } };
  };

  // ── Opening a study: the audited access event ──
  // Staff-only. Appends an immutable access-log entry (who opened which study,
  // when) — the privacy-sensitive surface — and returns nothing; the viewer
  // renders from the staff-gated queries below.
  func recordAccess(who : Principal, studyId : Nat, action : Text) {
    let id = nextAccessId; nextAccessId += 1;
    Map.add(accessLog, Nat.compare, id, { id; at = Time.now(); who; studyId; action });
  };
  public shared(msg) func openStudyOrTrap(studyId : Nat) : async () {
    Admin.requireNotPaused(admin);
    if (not isStaff(msg.caller)) { Runtime.trap("Not authorized — staff access only") };
    switch (Map.get(studies, Nat.compare, studyId)) {
      case null { Runtime.trap("Unknown study " # Nat.toText(studyId)) };
      case (?_) { recordAccess(msg.caller, studyId, "opened") };
    };
  };

  // ── Read views (flat records — the SDK decodes vec<record> of scalars) ──
  // All are staff-gated: a non-staff caller gets an empty list, never patient data.

  // Worklist: recent studies across all patients, newest first. Paginated.
  public shared query(msg) func worklistView(offset : Nat, limit : Nat) : async [{
    studyId : Nat; patientId : Nat; patientName : Text; mrn : Text; modality : Text; bodyPart : Text;
    status : Text; reportStatus : Text; imageCount : Nat; createdAt : Int;
  }] {
    if (not isStaff(msg.caller)) return [];
    let all = Array.sort(
      Iter.toArray(Map.values(studies)),
      func(a : Study, b : Study) : { #less; #equal; #greater } { Int.compare(b.createdAt, a.createdAt) },
    );
    let pageItems = Pagination.page<Study>(all, offset, limit).items;
    Array.map<Study, { studyId : Nat; patientId : Nat; patientName : Text; mrn : Text; modality : Text; bodyPart : Text; status : Text; reportStatus : Text; imageCount : Nat; createdAt : Int }>(
      pageItems,
      func(st) {
        let (pname, mrn) = switch (Map.get(patients, Nat.compare, st.patientId)) { case (?p) (p.name, p.mrn); case null ("(unknown)", "") };
        {
          studyId = st.id; patientId = st.patientId; patientName = pname; mrn;
          modality = st.modality; bodyPart = st.bodyPart; status = statusText(st.status);
          reportStatus = reportStatusOf(st.id); imageCount = countWhere<Image>(images, func(im) { im.studyId == st.id });
          createdAt = st.createdAt;
        };
      },
    );
  };
  public shared query(msg) func studyCount() : async Nat { if (not isStaff(msg.caller)) 0 else Map.size(studies) };

  // Patient directory. Paginated, newest first.
  public shared query(msg) func patientsView(offset : Nat, limit : Nat) : async [{
    id : Nat; mrn : Text; name : Text; sex : Text; birthYear : Nat; studyCount : Nat; createdAt : Int;
  }] {
    if (not isStaff(msg.caller)) return [];
    let all = Array.sort(
      Iter.toArray(Map.values(patients)),
      func(a : Patient, b : Patient) : { #less; #equal; #greater } { Int.compare(b.createdAt, a.createdAt) },
    );
    let pageItems = Pagination.page<Patient>(all, offset, limit).items;
    Array.map<Patient, { id : Nat; mrn : Text; name : Text; sex : Text; birthYear : Nat; studyCount : Nat; createdAt : Int }>(
      pageItems,
      func(p) {
        { id = p.id; mrn = p.mrn; name = p.name; sex = p.sex; birthYear = p.birthYear;
          studyCount = countWhere<Study>(studies, func(s) { s.patientId == p.id }); createdAt = p.createdAt };
      },
    );
  };
  public shared query(msg) func patientCount() : async Nat { if (not isStaff(msg.caller)) 0 else Map.size(patients) };

  // One patient header (0-or-1-element array — the SDK decodes vec<record>).
  public shared query(msg) func patientView(patientId : Nat) : async [{ id : Nat; mrn : Text; name : Text; sex : Text; birthYear : Nat; createdAt : Int }] {
    if (not isStaff(msg.caller)) return [];
    switch (Map.get(patients, Nat.compare, patientId)) {
      case null [];
      case (?p) [{ id = p.id; mrn = p.mrn; name = p.name; sex = p.sex; birthYear = p.birthYear; createdAt = p.createdAt }];
    };
  };

  // A patient's studies, newest first.
  public shared query(msg) func studiesForPatientView(patientId : Nat) : async [{
    id : Nat; modality : Text; bodyPart : Text; description : Text; status : Text; reportStatus : Text; seriesCount : Nat; imageCount : Nat; createdAt : Int;
  }] {
    if (not isStaff(msg.caller)) return [];
    let mine = Array.filter(Iter.toArray(Map.values(studies)), func(s : Study) : Bool { s.patientId == patientId });
    let sorted = Array.sort(mine, func(a : Study, b : Study) : { #less; #equal; #greater } { Int.compare(b.createdAt, a.createdAt) });
    Array.map<Study, { id : Nat; modality : Text; bodyPart : Text; description : Text; status : Text; reportStatus : Text; seriesCount : Nat; imageCount : Nat; createdAt : Int }>(
      sorted,
      func(st) {
        { id = st.id; modality = st.modality; bodyPart = st.bodyPart; description = st.description;
          status = statusText(st.status); reportStatus = reportStatusOf(st.id);
          seriesCount = countWhere<Series>(series, func(se) { se.studyId == st.id });
          imageCount = countWhere<Image>(images, func(im) { im.studyId == st.id }); createdAt = st.createdAt };
      },
    );
  };

  // One study header (with patient + report summary) — 0-or-1-element array.
  public shared query(msg) func studyView(studyId : Nat) : async [{
    id : Nat; patientId : Nat; patientName : Text; mrn : Text; modality : Text; bodyPart : Text; description : Text;
    status : Text; reportStatus : Text; reportFindings : Text; reportImpression : Text; createdAt : Int;
  }] {
    if (not isStaff(msg.caller)) return [];
    switch (Map.get(studies, Nat.compare, studyId)) {
      case null [];
      case (?st) {
        let (pname, mrn) = switch (Map.get(patients, Nat.compare, st.patientId)) { case (?p) (p.name, p.mrn); case null ("(unknown)", "") };
        let (rf, ri) = switch (Map.get(reports, Nat.compare, studyId)) { case (?r) (r.findings, r.impression); case null ("", "") };
        [{
          id = st.id; patientId = st.patientId; patientName = pname; mrn; modality = st.modality; bodyPart = st.bodyPart;
          description = st.description; status = statusText(st.status); reportStatus = reportStatusOf(studyId);
          reportFindings = rf; reportImpression = ri; createdAt = st.createdAt;
        }];
      };
    };
  };

  // Series of a study.
  public shared query(msg) func seriesForStudyView(studyId : Nat) : async [{ id : Nat; description : Text; imageCount : Nat; createdAt : Int }] {
    if (not isStaff(msg.caller)) return [];
    let mine = Array.filter(Iter.toArray(Map.values(series)), func(s : Series) : Bool { s.studyId == studyId });
    let sorted = Array.sort(mine, func(a : Series, b : Series) : { #less; #equal; #greater } { Int.compare(a.createdAt, b.createdAt) });
    Array.map<Series, { id : Nat; description : Text; imageCount : Nat; createdAt : Int }>(
      sorted,
      func(s) { { id = s.id; description = s.description; imageCount = countWhere<Image>(images, func(im) { im.seriesId == s.id }); createdAt = s.createdAt } },
    );
  };

  // All images of a study (for the viewer), ordered by series then instance.
  public shared query(msg) func studyImagesView(studyId : Nat) : async [{ id : Nat; seriesId : Nat; instanceNumber : Nat; imagePath : Text; createdAt : Int }] {
    if (not isStaff(msg.caller)) return [];
    let mine = Array.filter(Iter.toArray(Map.values(images)), func(im : Image) : Bool { im.studyId == studyId });
    let sorted = Array.sort(mine, func(a : Image, b : Image) : { #less; #equal; #greater } {
      switch (Nat.compare(a.seriesId, b.seriesId)) { case (#equal) Nat.compare(a.instanceNumber, b.instanceNumber); case other other };
    });
    Array.map<Image, { id : Nat; seriesId : Nat; instanceNumber : Nat; imagePath : Text; createdAt : Int }>(
      sorted,
      func(im) { { id = im.id; seriesId = im.seriesId; instanceNumber = im.instanceNumber; imagePath = im.imagePath; createdAt = im.createdAt } },
    );
  };

  // Immutable access log (admin-only), newest first. Paginated.
  public shared query(msg) func accessLogView(offset : Nat, limit : Nat) : async [{ id : Nat; at : Int; who : Principal; studyId : Nat; action : Text }] {
    if (not Admin.isAdmin(admin, msg.caller)) return [];
    let all = Array.sort(
      Iter.toArray(Map.values(accessLog)),
      func(a : AccessEvent, b : AccessEvent) : { #less; #equal; #greater } { Int.compare(b.at, a.at) },
    );
    Pagination.page<{ id : Nat; at : Int; who : Principal; studyId : Nat; action : Text }>(
      Array.map<AccessEvent, { id : Nat; at : Int; who : Principal; studyId : Nat; action : Text }>(
        all, func(e) { { id = e.id; at = e.at; who = e.who; studyId = e.studyId; action = e.action } },
      ),
      offset, limit,
    ).items;
  };
  public shared query(msg) func accessLogCount() : async Nat { if (not Admin.isAdmin(admin, msg.caller)) 0 else Map.size(accessLog) };

  // ── Demo seed ──
  // On a fresh contract the first signed-in visitor claims ownership (medical
  // imaging is access-controlled by nature — there is one operator) and a small,
  // realistic worklist is created so the app is immediately explorable. Image
  // records are seeded with empty paths (the viewer shows a placeholder); upload
  // a real image from the study page to see the media contract round-trip.
  public shared(msg) func seedDemo() : async Bool {
    if (Principal.isAnonymous(msg.caller)) { Runtime.trap("Sign in to load demo data") };
    if (Map.size(patients) > 0) { return false };
    ignore Admin.claimOwner(admin, msg.caller); // no-op if already owned

    // Patient 1 — scheduled study, no images yet.
    let p1 = addPatientRaw("MRN-100481", "Amira Hassan", "F", 1987);
    ignore addStudyRaw(msg.caller, p1, "XR", "Chest", "PA + lateral, routine");

    // Patient 2 — acquired study with a preliminary report.
    let p2 = addPatientRaw("MRN-100482", "Omar Farouk", "M", 1965);
    let s2 = addStudyRaw(msg.caller, p2, "CT", "Head", "Non-contrast, headache work-up");
    let se2 = addSeriesRaw(s2, "Axial 5mm");
    ignore addImageRaw(se2, s2, "", 1);
    ignore addImageRaw(se2, s2, "", 2);
    saveReportRaw(msg.caller, s2, "No acute intracranial haemorrhage. Ventricles normal in size.", "No acute abnormality.");

    // Patient 3 — fully reported (finalized) study.
    let p3 = addPatientRaw("MRN-100483", "Lena Park", "F", 1990);
    let s3 = addStudyRaw(msg.caller, p3, "MR", "Knee", "Right knee, post-injury");
    let se3 = addSeriesRaw(s3, "Sagittal PD");
    ignore addImageRaw(se3, s3, "", 1);
    saveReportRaw(msg.caller, s3, "Partial tear of the ACL. Small joint effusion.", "ACL partial tear; recommend orthopaedic review.");
    ignore doFinalizeReport(msg.caller, s3);

    true;
  };
  // ── The oracle: five laws over the whole archive, recomputable by anyone ──
  // (Counts only — no PHI crosses this surface.)
  public query func invariantReportView() : async [{ rule : Text; detail : Text }] {
    let bad = List.empty<{ rule : Text; detail : Text }>();
    // R1 hierarchy: every child points at a real parent.
    for ((id, st) in Map.entries(studies)) {
      if (Map.get(patients, Nat.compare, st.patientId) == null) {
        List.add(bad, { rule = "R1 hierarchy"; detail = "study #" # Nat.toText(id) # " points at a missing patient" });
      };
    };
    for ((id, se) in Map.entries(series)) {
      if (Map.get(studies, Nat.compare, se.studyId) == null) {
        List.add(bad, { rule = "R1 hierarchy"; detail = "series #" # Nat.toText(id) # " points at a missing study" });
      };
    };
    for ((id, im) in Map.entries(images)) {
      if (Map.get(series, Nat.compare, im.seriesId) == null) {
        List.add(bad, { rule = "R1 hierarchy"; detail = "image #" # Nat.toText(id) # " points at a missing series" });
      };
      switch (Map.get(series, Nat.compare, im.seriesId)) {
        case (?se) {
          if (se.studyId != im.studyId) List.add(bad, { rule = "R1 hierarchy"; detail = "image #" # Nat.toText(id) # " denormalized studyId disagrees with its series" });
        };
        case null {};
      };
    };
    // R2 reports: every report sits on a real study; a FINAL report is never empty.
    for ((sid, r) in Map.entries(reports)) {
      if (Map.get(studies, Nat.compare, sid) == null) {
        List.add(bad, { rule = "R2 report"; detail = "a report sits on a missing study #" # Nat.toText(sid) });
      };
      if (r.status == #final and (Text.size(r.findings) == 0 or Text.size(r.impression) == 0)) {
        List.add(bad, { rule = "R2 report"; detail = "final report on study #" # Nat.toText(sid) # " has empty findings or impression" });
      };
    };
    // R3 access log: append-only by construction — ids are dense 1..n and every
    // event references a real study.
    var i : Nat = 1;
    while (i < nextAccessId) {
      switch (Map.get(accessLog, Nat.compare, i)) {
        case null List.add(bad, { rule = "R3 log"; detail = "access event #" # Nat.toText(i) # " is missing — the log has a hole" });
        case (?e) {
          if (Map.get(studies, Nat.compare, e.studyId) == null) {
            List.add(bad, { rule = "R3 log"; detail = "access event #" # Nat.toText(i) # " references a missing study" });
          };
        };
      };
      i += 1;
    };
    // R4 status: a study's status agrees with its data (images ⇒ at least
    // acquired; a final report ⇒ reported).
    for ((sid, st) in Map.entries(studies)) {
      var hasImages = false;
      for ((_, im) in Map.entries(images)) { if (im.studyId == sid) hasImages := true };
      if (hasImages and st.status == #scheduled) {
        List.add(bad, { rule = "R4 status"; detail = "study #" # Nat.toText(sid) # " has images but is still scheduled" });
      };
      switch (Map.get(reports, Nat.compare, sid)) {
        case (?r) {
          if (r.status == #final and st.status != #reported) {
            List.add(bad, { rule = "R4 status"; detail = "study #" # Nat.toText(sid) # " has a final report but is not marked reported" });
          };
        };
        case null {};
      };
    };
    // R5 instances: instance numbers are unique within a series.
    for ((sid, _) in Map.entries(series)) {
      let seen = Map.empty<Nat, Bool>();
      for ((_, im) in Map.entries(images)) {
        if (im.seriesId == sid) {
          if (Map.get(seen, Nat.compare, im.instanceNumber) != null) {
            List.add(bad, { rule = "R5 instance"; detail = "series #" # Nat.toText(sid) # " has a duplicate instance number " # Nat.toText(im.instanceNumber) });
          };
          Map.add(seen, Nat.compare, im.instanceNumber, true);
        };
      };
    };
    List.toArray(bad);
  };

  // One public row for the footer seal — counts only, never PHI.
  public query func lumenSealView() : async [{
    patients : Nat; studies : Nat; series : Nat; images : Nat;
    reportsDraft : Nat; reportsFinal : Nat; accessEvents : Nat; staff : Nat;
    violations : Nat; checkedAt : Int;
  }] {
    var draft : Nat = 0; var fin : Nat = 0;
    for ((_, r) in Map.entries(reports)) { if (r.status == #final) fin += 1 else draft += 1 };
    // Cheap violation count for the seal: the log-density + hierarchy checks.
    var v : Nat = 0;
    var i : Nat = 1;
    while (i < nextAccessId) { if (Map.get(accessLog, Nat.compare, i) == null) v += 1; i += 1 };
    for ((_, st) in Map.entries(studies)) { if (Map.get(patients, Nat.compare, st.patientId) == null) v += 1 };
    [{
      patients = Map.size(patients); studies = Map.size(studies); series = Map.size(series);
      images = Map.size(images); reportsDraft = draft; reportsFinal = fin;
      accessEvents = Map.size(accessLog); staff = Map.size(roles);
      violations = v; checkedAt = Time.now();
    }];
  };

  // The modality board: live counts per (modality × status) — the status wall
  // draws from this. Staff-only (it is worklist-derived).
  public shared query(msg) func modalityBoardView() : async [{
    modality : Text; scheduled : Nat; acquired : Nat; reported : Nat;
  }] {
    if (not isStaff(msg.caller)) return [];
    let mods = Map.empty<Text, (Nat, Nat, Nat)>();
    for ((_, st) in Map.entries(studies)) {
      let (a, b, c) = switch (Map.get(mods, Text.compare, st.modality)) { case (?x) x; case null (0, 0, 0) };
      let next = switch (st.status) {
        case (#scheduled) (a + 1, b, c);
        case (#acquired) (a, b + 1, c);
        case (#reported) (a, b, c + 1);
      };
      Map.add(mods, Text.compare, st.modality, next);
    };
    Array.map<(Text, (Nat, Nat, Nat)), { modality : Text; scheduled : Nat; acquired : Nat; reported : Nat }>(
      Iter.toArray(Map.entries(mods)),
      func((m, (a, b, c))) { { modality = m; scheduled = a; acquired = b; reported = c } },
    );
  };
};
