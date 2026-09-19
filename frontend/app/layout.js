import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../components/auth-provider";
import { PaymentFeedbackProvider } from "../components/payment-feedback-provider";
import { ToastProvider } from "../components/toast-provider";
import { WorkNotifierProvider } from "../components/work-notifier-provider";
import { MotionRoot } from "../components/motion-root";

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
      // globals.css sets `scroll-behavior: smooth` for the landing page's
      // anchors. Without this attribute Next also smooth-scrolls the whole
      // document on every route transition, which reads as the page drifting
      // rather than navigating; the attribute scopes smooth scrolling to
      // same-page anchors, which is the only place it was wanted.
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Provider order mirrors the dependency: the toast stack can announce
            a payment, payment feedback is independent of the session but must
            wrap the checkout surface that plays it, and the work notifier is
            innermost because it is the only one that needs all three — it
            reads the session, speaks through the toast stack, and chimes with
            payment feedback when a job finishes. */}
        <AuthProvider>
          <PaymentFeedbackProvider>
            <ToastProvider>
              <WorkNotifierProvider>
                <MotionRoot>{children}</MotionRoot>
              </WorkNotifierProvider>
            </ToastProvider>
          </PaymentFeedbackProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
