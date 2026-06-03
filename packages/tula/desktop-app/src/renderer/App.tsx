import { Routes, Route } from 'react-router-dom';

function HomePage() {
  return <div style={{ padding: '2rem' }}><h1>Tula</h1><p>Agent control and monitoring</p></div>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
