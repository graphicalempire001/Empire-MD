import PageHeader from '../components/PageHeader'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="heading-md text-[#1a1a1a] mb-3">{title}</h2>
      <div className="body-text space-y-3">{children}</div>
    </section>
  )
}

export default function Terms() {
  return (
    <div className="min-h-screen">
      <PageHeader eyebrow="Legal" title="Terms of Service" />
      <main className="section-padding pb-24">
        <div className="max-w-3xl mx-auto">
          <p className="body-text mb-10">
            Last updated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
            By pairing a bot through Empire MD, you agree to the terms below.
          </p>

          <Section title="The service">
            <p>
              Empire MD gives you a personal WhatsApp automation bot: media tools, group moderation,
              scheduling, AI replies, and more, controlled with commands sent in WhatsApp. The Free plan
              covers the core toolset; Premium unlocks the rest.
            </p>
          </Section>

          <Section title="Your account and session">
            <p>
              You're responsible for what your bot does once paired — messages it sends, groups it's added
              to, and how it's configured. Keep your pairing code and session private; anyone with it can
              control your bot.
            </p>
            <p>
              We may stop or delete a session that's inactive for an extended period (see our{' '}
              <a href="/privacy" className="text-[#00A884] hover:underline">Privacy Policy</a> for exact
              timelines), or that's being used to spam, harass, or break WhatsApp's own terms of service.
            </p>
          </Section>

          <Section title="Premium billing">
            <p>
              Premium is ₦1,500 for 30 days, paid through Flutterwave. Longer plans (2, 3, or 6 months) are
              billed at a discount shown on the upgrade page. Premium activates automatically once payment
              is confirmed and stacks on top of any remaining time on your current plan.
            </p>
            <p>
              Payments are for time-based access to features, not a physical good — because of this, we
              don't offer refunds once Premium has been activated on your session. If a payment goes
              through but Premium doesn't activate, contact support with your payment reference and we'll
              fix it or refund it, whichever gets you sorted faster.
            </p>
          </Section>

          <Section title="Acceptable use">
            <p>You agree not to use Empire MD to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Send spam, mass unsolicited messages, or phishing links</li>
              <li>Harass, threaten, or impersonate someone</li>
              <li>Break WhatsApp's Terms of Service or applicable law</li>
              <li>Attempt to resell, reverse-engineer, or rate-limit-abuse the service</li>
            </ul>
            <p>Accounts used for the above may be suspended without a refund.</p>
          </Section>

          <Section title="No uptime guarantee">
            <p>
              We work to keep bots online, but WhatsApp connectivity, third-party APIs, and hosting
              infrastructure aren't fully within our control. The service is provided "as is" without a
              guaranteed uptime commitment. Check{' '}
              <a href="/status" className="text-[#00A884] hover:underline">Status</a> or our{' '}
              <a href="https://t.me/BOTWAN_SUPPORT" target="_blank" rel="noopener noreferrer" className="text-[#00A884] hover:underline">
                Telegram
              </a>{' '}
              for known issues.
            </p>
          </Section>

          <Section title="Ownership">
            <p>
              The Empire MD name, branding, and bot software belong to Empire Digitals. Your data,
              messages, and group content remain yours.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              We may update these terms as the service evolves. Material changes will be reflected here
              with an updated date at the top of this page.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these terms:{' '}
              <a href="https://wa.me/2347086757575" target="_blank" rel="noopener noreferrer" className="text-[#00A884] hover:underline">
                WhatsApp
              </a>{' '}
              or{' '}
              <a href="https://t.me/BOTWAN_SUPPORT" target="_blank" rel="noopener noreferrer" className="text-[#00A884] hover:underline">
                Telegram
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}
