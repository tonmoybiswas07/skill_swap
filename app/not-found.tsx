import Link from "next/link";

export default function NotFound() {
  return <main className="discover">
    <h1>Page not found</h1>
    <Link className="button" href="/">Back to Discover</Link>
  </main>;
}
