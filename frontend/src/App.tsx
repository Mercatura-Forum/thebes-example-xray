import { Routes, Route } from 'react-router-dom'
import { MemphisGate } from '@thebes/sdk'
import { Layout } from './components/Layout'
import { Worklist } from './pages/Worklist'
import { Patients } from './pages/Patients'
import { PatientDetail } from './pages/PatientDetail'
import { Study } from './pages/Study'
import { Staff } from './pages/Staff'
import { AccessLog } from './pages/AccessLog'

export function App() {
  return (
    <MemphisGate appName="Lumen" tagline="Sign in to the reading room.">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Worklist />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/patient/:id" element={<PatientDetail />} />
          <Route path="/study/:id" element={<Study />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/audit" element={<AccessLog />} />
          <Route path="*" element={<Worklist />} />
        </Route>
      </Routes>
    </MemphisGate>
  )
}
