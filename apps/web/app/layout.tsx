import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@radix-ui/themes/styles.css";
import { Container, Theme, Box } from "@radix-ui/themes";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: 'BookFinder',
  description: 'Upload a book cover and see it\'s first pages.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Theme appearance="light" radius="large" accentColor="blue" panelBackground="translucent">
          <Box py="6">
            <Container size="3">
              {children}
            </Container>
          </Box>
        </Theme>
      </body>
    </html>
  );
}
