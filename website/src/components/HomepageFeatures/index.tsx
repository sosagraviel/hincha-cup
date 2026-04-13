import type { ReactNode } from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: ReactNode;
  description: ReactNode;
};

// Custom SVG Icons with Qubika brand gradient
const AutomationIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad-automation" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0693e3" />
        <stop offset="100%" stopColor="#9b51e0" />
      </linearGradient>
    </defs>
    {/* Background circle */}
    <circle cx="40" cy="40" r="38" fill="url(#grad-automation)" opacity="0.1" />
    {/* Checkmark */}
    <path
      d="M25 40 L35 50 L55 30"
      stroke="url(#grad-automation)"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Orbital rings */}
    <path
      d="M40 15 L40 20"
      stroke="url(#grad-automation)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M40 60 L40 65"
      stroke="url(#grad-automation)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M15 40 L20 40"
      stroke="url(#grad-automation)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M60 40 L65 40"
      stroke="url(#grad-automation)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Corner indicators */}
    <circle cx="23" cy="23" r="3" fill="url(#grad-automation)" opacity="0.6" />
    <circle cx="57" cy="23" r="3" fill="url(#grad-automation)" opacity="0.6" />
    <circle cx="23" cy="57" r="3" fill="url(#grad-automation)" opacity="0.6" />
    <circle cx="57" cy="57" r="3" fill="url(#grad-automation)" opacity="0.6" />
  </svg>
);

const StackAgnosticIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad-stack" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0693e3" />
        <stop offset="100%" stopColor="#9b51e0" />
      </linearGradient>
    </defs>
    {/* Grid of squares with increasing opacity */}
    <rect x="15" y="15" width="22" height="22" rx="4" fill="url(#grad-stack)" opacity="0.25" />
    <rect x="43" y="15" width="22" height="22" rx="4" fill="url(#grad-stack)" opacity="0.5" />
    <rect x="15" y="43" width="22" height="22" rx="4" fill="url(#grad-stack)" opacity="0.75" />
    <rect x="43" y="43" width="22" height="22" rx="4" fill="url(#grad-stack)" opacity="1" />
    {/* Connecting lines */}
    <line x1="37" y1="26" x2="43" y2="26" stroke="url(#grad-stack)" strokeWidth="2" opacity="0.4" />
    <line x1="26" y1="37" x2="26" y2="43" stroke="url(#grad-stack)" strokeWidth="2" opacity="0.4" />
    <line x1="54" y1="37" x2="54" y2="43" stroke="url(#grad-stack)" strokeWidth="2" opacity="0.4" />
  </svg>
);

const ProductionReadyIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad-production" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0693e3" />
        <stop offset="100%" stopColor="#9b51e0" />
      </linearGradient>
    </defs>
    {/* Concentric circles representing layers */}
    <circle
      cx="40"
      cy="40"
      r="35"
      stroke="url(#grad-production)"
      strokeWidth="3"
      fill="none"
      opacity="0.3"
    />
    <circle cx="40" cy="40" r="27" fill="url(#grad-production)" opacity="0.15" />
    <circle cx="40" cy="40" r="19" fill="url(#grad-production)" opacity="0.25" />
    <circle cx="40" cy="40" r="11" fill="url(#grad-production)" opacity="0.5" />
    <circle cx="40" cy="40" r="5" fill="url(#grad-production)" />
    {/* Pulse indicators */}
    <circle cx="40" cy="12" r="2" fill="url(#grad-production)" />
    <circle cx="40" cy="68" r="2" fill="url(#grad-production)" />
    <circle cx="12" cy="40" r="2" fill="url(#grad-production)" />
    <circle cx="68" cy="40" r="2" fill="url(#grad-production)" />
  </svg>
);

const FeatureList: FeatureItem[] = [
  {
    title: 'Full SDLC Automation',
    icon: <AutomationIcon />,
    description: (
      <>
        From idea to production-ready pull request with minimal human intervention. Handles ticket
        creation, implementation, testing, and PR generation — achieving 70-80% time savings across
        the full development cycle.
      </>
    ),
  },
  {
    title: 'Stack Agnostic',
    icon: <StackAgnosticIcon />,
    description: (
      <>
        Works with any tech stack — TypeScript, Python, Go, Java, Rust, and more. Automatically
        detects your project's languages, frameworks, and conventions to provide tailored
        assistance.
      </>
    ),
  },
  {
    title: 'Production Ready',
    icon: <ProductionReadyIcon />,
    description: (
      <>
        Built for enterprise use across 1000+ projects. Features include multi-provider AI support
        (Anthropic, OpenAI, Google), Docker runtime, comprehensive security controls, and full CI/CD
        integration.
      </>
    ),
  },
];

function Feature({ title, icon, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>{icon}</div>
        <div className={styles.featureContent}>
          <Heading as="h3" className={styles.featureTitle}>
            {title}
          </Heading>
          <p className={styles.featureDescription}>{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
