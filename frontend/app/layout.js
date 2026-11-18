import "./globals.css";

export const metadata = {
  title: "TraceNet | Logistics Intelligence",
  description: "Blockchain verified logistics tracking and traceability",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
