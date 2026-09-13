import "./globals.css";

export const metadata = {
  title: "Bostanlı Training Club",
  description: "Salon yönetim paneli",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
