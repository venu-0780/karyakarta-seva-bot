import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: 'Karyakarta Seva Bot',
  description: 'Multi-platform conversational bot (WhatsApp-first) ported from the Karyakarta Seva prototype',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
