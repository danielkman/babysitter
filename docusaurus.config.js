const { themes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Babysitter Docs',
  tagline: 'Deterministic orchestration, quality gates, and docs-as-code for Babysitter.',
  favicon: 'img/logo.svg',
  url: 'https://a5c-ai.github.io',
  baseUrl: '/babysitter/',
  organizationName: 'a5c-ai',
  projectName: 'babysitter',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,
  onBrokenLinks: 'warn',
  markdown: {
    format: 'md',
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: 'docs',
          exclude: [
            'retrospectives/hagaybar-budget-manager/banking-ux-polish.md',
            'retrospectives/joe-habu-superbabysitter/subagent-tdd-loop.md'
          ],
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/a5c-ai/babysitter/tree/staging/',
          showLastUpdateTime: true
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ],
  themeConfig: {
    image: 'img/logo.svg',
    navbar: {
      title: 'Babysitter',
      logo: {
        alt: 'Babysitter logo',
        src: 'img/logo.svg'
      },
      items: [
        { to: '/', label: 'Home', position: 'left' },
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          label: 'Docs',
          position: 'left'
        },
        { to: '/docs/user-guide/', label: 'User Guide', position: 'left' },
        { to: '/docs/plugins', label: 'Plugins', position: 'left' },
        {
          href: 'https://github.com/a5c-ai/babysitter',
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Start Here',
          items: [
            { label: 'Quickstart', to: '/docs/user-guide/getting-started/quickstart' },
            { label: 'CLI Reference', to: '/docs/user-guide/reference/cli-reference' }
          ]
        },
        {
          title: 'Deep Dives',
          items: [
            { label: 'Process Library', to: '/docs/user-guide/features/process-library' },
            { label: 'GitHub Actions Setup', to: '/docs/github-actions-setup-babysitter' }
          ]
        },
        {
          title: 'Community',
          items: [
            { label: 'Issues', href: 'https://github.com/a5c-ai/babysitter/issues' },
            { label: 'Discussions', href: 'https://github.com/a5c-ai/babysitter/discussions' }
          ]
        }
      ],
      copyright: `Copyright ${new Date().getFullYear()} A5C AI`
    },
    prism: {
      theme: themes.github,
      darkTheme: themes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'typescript']
    }
  }
};

module.exports = config;
