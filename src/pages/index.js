import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

const pathways = [
  {
    title: 'Start Fast',
    href: '/docs/user-guide/getting-started/quickstart',
    description:
      'Install Babysitter, configure your harness, and run the first orchestration loop without digging through the whole repo first.'
  },
  {
    title: 'Run The System',
    href: '/docs/user-guide/reference/cli-reference',
    description:
      'Jump straight into the command surface: runs, tasks, sessions, plugins, harnesses, and process-library controls.'
  },
  {
    title: 'Design Better Processes',
    href: '/docs/user-guide/features/process-definitions',
    description:
      'Learn how Babysitter turns prompts into bounded, replayable workflows with explicit gates and deterministic evidence.'
  },
  {
    title: 'Ship With GitHub Actions',
    href: '/docs/github-actions-setup-babysitter',
    description:
      'Use the docs and CI setup guides to connect Babysitter orchestration to your repository workflows and review loops.'
  }
];

const stats = [
  { label: 'Docs files', value: '379+' },
  { label: 'User guide tracks', value: '4' },
  { label: 'Core modes', value: 'Call, Yolo, Plan, Forever' }
];

export default function Home() {
  return (
    <Layout
      title="Babysitter Docs"
      description="GitHub Pages documentation for Babysitter, sourced from the repository docs tree."
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>GitHub Pages docs from the repo source tree</p>
            <h1>Babysitter, documented like the orchestration system it ships.</h1>
            <p className={styles.lead}>
              The site is built straight from <code>./docs</code>, so product docs, process
              guidance, setup guides, and research live in one auditable source of truth.
            </p>
            <div className={styles.actions}>
              <Link className="button button--primary button--lg" to="/docs/user-guide/">
                Open the user guide
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/plugins">
                Explore plugins
              </Link>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.terminal}>
              <div className={styles.terminalBar}>
                <span />
                <span />
                <span />
              </div>
              <pre>
                <code>{`/babysitter:call add tests and gates

Iteration 1  -> code + tests
Iteration 2  -> verify failures
Iteration 3  -> converge to target

Result: documented, replayable, reviewable`}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Navigate by intent</p>
            <h2>Pick the shortest path to the answer you need.</h2>
          </div>
          <div className={styles.grid}>
            {pathways.map((pathway) => (
              <Link
                key={pathway.title}
                to={pathway.href}
                className={clsx(styles.card, styles.pathCard)}
              >
                <h3>{pathway.title}</h3>
                <p>{pathway.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Why this site shape</p>
            <h2>One docs tree, one build, one deployment path.</h2>
          </div>
          <div className={styles.grid}>
            <div className={styles.card}>
              <h3>Source-first</h3>
              <p>
                The Pages site reads the existing repository markdown instead of introducing a
                second content directory that would drift.
              </p>
            </div>
            <div className={styles.card}>
              <h3>Repo-native</h3>
              <p>
                The setup stays inside the npm workspace and deploys through GitHub Actions, which
                matches the rest of this project’s release surface.
              </p>
            </div>
            <div className={styles.card}>
              <h3>Audit-friendly</h3>
              <p>
                Docusaurus gives the repo a browsable static site without hiding the original docs
                files or the process history behind another platform.
              </p>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
