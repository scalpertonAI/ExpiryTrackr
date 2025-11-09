import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      const { supabase } = await import('@/lib/supabaseClient');
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.push('/dashboard');
      }
    };

    checkAuth();
  }, [router]);

  return (
    <>
      <Head>
        <title>ExpiryTrackr - Never forget to renew anything again</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100">
        {/* Navigation */}
        <nav className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-3xl">⏰</span>
              <span className="text-2xl font-bold text-primary-600">ExpiryTrackr</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-700 hover:text-primary-600">
                Login
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="container mx-auto px-6 py-20">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Never forget to renew
              <span className="block text-primary-600">anything again</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Track all your expiry-based items — documents, subscriptions, warranties, and more.
              Get automatic reminders via WhatsApp, Email, or SMS.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup" className="btn btn-primary text-lg px-8 py-3">
                Start Free Trial
              </Link>
              <a href="#features" className="btn btn-secondary text-lg px-8 py-3">
                Learn More
              </a>
            </div>
          </div>

          {/* Features Grid */}
          <div id="features" className="mt-32 grid md:grid-cols-3 gap-8">
            <div className="card text-center fade-in">
              <div className="text-4xl mb-4">📸</div>
              <h3 className="text-xl font-semibold mb-2">Smart Upload</h3>
              <p className="text-gray-600">
                Upload photos of documents. AI automatically detects expiry dates using OCR.
              </p>
            </div>

            <div className="card text-center fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold mb-2">AI Detection</h3>
              <p className="text-gray-600">
                Powerful AI extracts expiry dates from emails, documents, and text with high accuracy.
              </p>
            </div>

            <div className="card text-center fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="text-4xl mb-4">🔔</div>
              <h3 className="text-xl font-semibold mb-2">Multi-Channel Alerts</h3>
              <p className="text-gray-600">
                Get reminders via WhatsApp, Email, SMS, or Push notifications at your preferred time.
              </p>
            </div>

            <div className="card text-center fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="text-4xl mb-4">👨‍👩‍👧‍👦</div>
              <h3 className="text-xl font-semibold mb-2">Family Sharing</h3>
              <p className="text-gray-600">
                Share items with family members so everyone stays informed about renewals.
              </p>
            </div>

            <div className="card text-center fade-in" style={{ animationDelay: '0.4s' }}>
              <div className="text-4xl mb-4">📧</div>
              <h3 className="text-xl font-semibold mb-2">Email Forwarding</h3>
              <p className="text-gray-600">
                Forward emails to ExpiryTrackr and we'll automatically extract expiry information.
              </p>
            </div>

            <div className="card text-center fade-in" style={{ animationDelay: '0.5s' }}>
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-xl font-semibold mb-2">Secure & Private</h3>
              <p className="text-gray-600">
                Your data is encrypted and protected. We never share your information with third parties.
              </p>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mt-32">
            <h2 className="text-3xl font-bold text-center mb-12">What You Can Track</h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { icon: '📄', label: 'Documents', items: 'Passport, License, ID Cards' },
                { icon: '💳', label: 'Subscriptions', items: 'Netflix, Spotify, Domains' },
                { icon: '🏥', label: 'Healthcare', items: 'Insurance, Prescriptions' },
                { icon: '🏢', label: 'Business', items: 'Permits, Certifications, Contracts' },
              ].map((category, idx) => (
                <div key={idx} className="card text-center">
                  <div className="text-3xl mb-2">{category.icon}</div>
                  <h4 className="font-semibold text-lg mb-1">{category.label}</h4>
                  <p className="text-sm text-gray-600">{category.items}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="mt-32">
            <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Free Plan */}
              <div className="card border-2 border-gray-200">
                <h3 className="text-2xl font-bold mb-2">Free</h3>
                <div className="text-3xl font-bold mb-4">₹0</div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">10 items</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">Email reminders</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">Manual entry</span>
                  </li>
                </ul>
                <Link href="/signup" className="btn btn-secondary w-full">
                  Get Started
                </Link>
              </div>

              {/* Pro Plan */}
              <div className="card border-4 border-primary-500 relative">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Popular
                </div>
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <div className="text-3xl font-bold mb-4">
                  ₹499<span className="text-lg text-gray-600">/month</span>
                </div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">200 items</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">WhatsApp & SMS alerts</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">File upload & OCR</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">Family sharing</span>
                  </li>
                </ul>
                <Link href="/signup" className="btn btn-primary w-full">
                  Start Free Trial
                </Link>
              </div>

              {/* Business Plan */}
              <div className="card border-2 border-gray-200">
                <h3 className="text-2xl font-bold mb-2">Business</h3>
                <div className="text-3xl font-bold mb-4">
                  ₹1,999<span className="text-lg text-gray-600">/month</span>
                </div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">2000 items</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">All Pro features</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">Team dashboard</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm">API access</span>
                  </li>
                </ul>
                <Link href="/signup" className="btn btn-secondary w-full">
                  Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-gray-900 text-white mt-32 py-12">
          <div className="container mx-auto px-6 text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <span className="text-3xl">⏰</span>
              <span className="text-2xl font-bold">ExpiryTrackr</span>
            </div>
            <p className="text-gray-400 mb-4">Never forget to renew anything again</p>
            <div className="flex justify-center space-x-6 text-sm">
              <a href="/privacy" className="hover:text-primary-400">
                Privacy Policy
              </a>
              <a href="/terms" className="hover:text-primary-400">
                Terms of Service
              </a>
              <a href="/contact" className="hover:text-primary-400">
                Contact
              </a>
            </div>
            <p className="text-gray-500 mt-8 text-sm">
              © 2024 ExpiryTrackr. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
