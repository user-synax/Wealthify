import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../components/auth-provider";
import { PaymentFeedbackProvider } from "../components/payment-feedback-provider";
import { ToastProvider } from "../components/toast-provider";
import { WorkNotifierProvider } from "../components/work-notifier-provider";
import { MotionRoot } from "../components/motion-root";
import PwaRegister from "../components/pwa-register";

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
  applicationName: "Wealthify",
  manifest: "/manifest.webmanifest",

  /* iOS ignores the manifest's display mode and most of its icons, so an
     installed web app there is configured entirely through these. `default`
     status bar rather than `black-translucent` because the app's own top bar is
     light — a translucent bar would put white text over white. */
  appleWebApp: {
    capable: true,
    title: "Wealthify",
    statusBarStyle: "default",
  },

  /* iOS Safari auto-links anything that looks like a phone number, a date or an
     address. In a money app that means a balance, an invoice date or a street
     name can turn into a tap target with a blue underline. Turning all four off
     is the difference between "a number" and "a link to somewhere else". */
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
    date: false,
  },

  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

/* `viewportFit: "cover"` is what unlocks `env(safe-area-inset-*)` on iOS: it
   lets the app paint under the home indicator and the notch, and the shell then
   pads itself back out of the way. Without it the bottom tab bar floats above a
   permanent white letterbox strip, which is the single clearest tell that
   something is a website and not an app.

   `maximumScale` is deliberately absent. Locking pinch-zoom is a common way to
   make a page "feel native" and it takes magnification away from the people who
   need it most. */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",

  /* The app's own chrome is what sits under the status bar on every signed-in
     screen — a white header — so the tint is the canvas, not the navy marketing
     hero. The three pages that open on navy override this while they are
     mounted; see `components/theme-color.js`. */
  themeColor: "#ffffff",

  /* The soft keyboard shrinks the *layout* viewport rather than overlaying it,
     which is what every native app does and what the bottom sheets assume. With
     the default (`resizes-visual`) a sheet stays pinned to the real bottom edge
     and the keyboard simply covers its controls — so the PIN pad ends up
     underneath the keyboard you opened to reach it. */
  interactiveWidget: "resizes-content",
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
        <PwaRegister />
      </body>
    </html>
  );
}
