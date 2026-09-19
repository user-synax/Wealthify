import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../components/auth-provider";
import { PaymentFeedbackProvider } from "../components/payment-feedback-provider";
import { ToastProvider } from "../components/toast-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Wealthify - Your virtual financial life",
  description:
    "Earn it. Spend it. Invest it. Build it. A financial life simulator with real-feeling transactions and 100% virtual money.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Provider order mirrors the dependency: the toast stack can announce
            a payment, and payment feedback is independent of the session but
            must wrap the checkout surface that plays it. */}
        <AuthProvider>
          <PaymentFeedbackProvider>
            <ToastProvider>{children}</ToastProvider>
          </PaymentFeedbackProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
