import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Nav } from "./Nav";
import { Dashboard } from "./features/dashboard/Dashboard";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { RewardsPage } from "./features/rewards/RewardsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard memberId="demo-ada" />} />
        <Route path="/transactions" element={<TransactionsPage memberId="demo-ada" />} />
        <Route path="/rewards" element={<RewardsPage memberId="demo-ada" />} />
      </Routes>
    </BrowserRouter>
  );
}
