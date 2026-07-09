import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Nav } from "./Nav";
import { Dashboard } from "./features/dashboard/Dashboard";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { RewardsPage } from "./features/rewards/RewardsPage";
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
      </Routes>
    </BrowserRouter>
  );
}
