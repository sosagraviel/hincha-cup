import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import '@site/src/css/hero.css';

function HomepageHeader() {
  return (
    <header className="qaf-hero">
      <div className="qaf-hero__overlay"></div>
      <div className="qaf-hero__content">
        <div className="qaf-hero__badge">Built for the Agentic era</div>
        <h1 className="qaf-hero__title">From idea to pull request — autonomously</h1>
        <p className="qaf-hero__subtitle">
          AI-powered autonomous software development workflows orchestrating context, planning,
          implementation, validation, and pull request creation across real codebases.
        </p>
        <div className="qaf-hero__ctas">
          <Link className="qaf-button qaf-button--primary" to="/docs/getting-started/installation">
            Get Started →
          </Link>
          <Link className="qaf-button qaf-button--secondary" to="/docs/getting-started/quickstart">
            See How It Works
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="AI-powered autonomous software development workflows - from idea to production-ready pull request"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
