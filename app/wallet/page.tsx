import { collections } from "@/lib/booking";
import { requireUser } from "@/lib/session";
import { LocalTime } from "../interactive";

const labels = {
  grant: "Starter credit", reservation: "Session reservation",
  release: "Reservation released", transfer: "Completed session",
};

function delta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default async function WalletPage() {
  const user = await requireUser();
  const { wallets, ledger } = collections();
  const [balance, activity] = await Promise.all([
    wallets.findOne({ _id: user.id }),
    ledger.find({ userId: user.id }).sort({ at: -1 }).toArray(),
  ]);
  if (!balance) throw new Error("Wallet unavailable.");

  return <main className="discover">
    <h1>Wallet</h1>
    <div className="panels">
      <section className="panel">
        <h2>Credit balance</h2>
        <dl className="balances">
          <div><dt>Available</dt><dd>{balance.available}</dd></div>
          <div><dt>Reserved</dt><dd>{balance.reserved}</dd></div>
        </dl>
      </section>
      <section className="panel">
        <h2>Activity history</h2>
        {activity.length ? <ul className="slots">{activity.map((entry) => <li className="ledger-row" key={entry._id}>
          <strong>{labels[entry.kind]}</strong>
          <p>{delta(entry.available)} available · {delta(entry.reserved)} reserved</p>
          <LocalTime start={entry.at.toISOString()} />
        </li>)}</ul> : <p>No credit activity yet.</p>}
      </section>
    </div>
  </main>;
}
