import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Nav } from "./Nav";
import { Dashboard } from "./features/dashboard/Dashboard";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { RewardsPage } from "./features/rewards/RewardsPage";
import { TravelAgentPage } from "./features/travel-agent/TravelAgentPage";
import { getMemberId } from "./auth";

export default function App() {
  // With auth on this is the token's sub; with it off it's the demo member (or a ?as= override).
  const memberId = getMemberId();
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard memberId={memberId} />} />
        <Route path="/transactions" element={<TransactionsPage memberId={memberId} />} />
        <Route path="/rewards" element={<RewardsPage memberId={memberId} />} />
        <Route path="/travel-agent" element={<TravelAgentPage memberId={memberId} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
