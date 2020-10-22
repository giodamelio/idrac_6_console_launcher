require('dotenv').config();

const logger = require('signale');
const puppeteer = require('puppeteer');
const Listr = require('listr');
const rmfr = require('rmfr');
// const execa = require('execa');

function screenshots() {
  let count = 0;
  return (name) => ({
    title: `Take screenshot: ${name}`,
    task: async (ctx) => {
      // eslint-disable-next-line no-plusplus
      await ctx.page.screenshot({ path: `screenshots/${count++}_${name}.png` });
    },
  });
}

function waitSeconds(seconds, message) {
  return {
    title: `Waiting ${seconds} seconds for ${message}`,
    task: async (ctx) => {
      await ctx.page.waitForTimeout(seconds * 1000);
    },
  };
}

function waitSelector(selector, ctxItem = 'page') {
  return {
    title: `Waiting for selector '${selector}'`,
    task: async (ctx) => {
      await ctx[ctxItem].waitForSelector(selector);
    },
  };
}

async function main() {
  const screenshot = screenshots();

  const tasks = new Listr([
    {
      title: 'Cleanup files',
      task: async () => {
        await rmfr('screenshots/*', { glob: true });
        await rmfr('downloads/*', { glob: true });
      },
    },
    {
      title: 'Starting headless Chrome',
      task: async (ctx) => {
        ctx.browser = await puppeteer.launch({
          // You should NEVER run Chrome without it's sanbox! Seriously!
          // I'm lazy though and Chrome headless inside a Docker container is hard...
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          // Probably shouldn't do this either, but iDrac is running with a self signed cert
          ignoreHTTPSErrors: true,
        });
        ctx.page = await ctx.browser.newPage();
        await ctx.page.setViewport({ width: 1366, height: 768 });
        // eslint-disable-next-line no-underscore-dangle
        await ctx.page._client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: './downloads',
        });
      },
    },
    {
      title: 'Load iDRAC login page',
      task: async (ctx) => {
        await ctx.page.goto(process.env.IDRAC_URL, {
          waitUntil: 'networkidle0',
        });
        await ctx.page.waitForSelector('.login_header_idrac');
      },
    },
    screenshot('login_page'),
    waitSeconds(5, 'iDRAC login page'),
    screenshot('login_page_settled'),
    {
      title: 'Logging in',
      task: async (ctx) => {
        await ctx.page.type('#user', process.env.IDRAC_USERNAME);
        await ctx.page.type('#password', process.env.IDRAC_PASSWORD);
        await ctx.page.click('#btnOK > span:nth-child(1)');
      },
    },
    waitSeconds(20, 'iDRAC dashboard'),
    // waitSelector('frame[name="da"]'),
    screenshot('dashboard_settled'),
    {
      title: 'Get the correct iFrame',
      task: async (ctx) => {
        ctx.frame = ctx.page
          .mainFrame()
          .childFrames()
          .find((frame) => frame.url().includes('sysSummaryData.html'));
      },
    },
    waitSelector('#remoteConLaunch_link', 'frame'),
    {
      title: 'Download jnlp file',
      task: async (ctx) => {
        // await ctx.frame.click('#remoteConLaunch_link > span:nth-child(1)');
        await ctx.frame.evaluate('QuicklaunchKVM(CurUsrName);');
        await ctx.page.waitForTimeout(2000);
      },
    },
    {
      title: 'Logout of iDRAC',
      task: async (ctx) => {
        await ctx.page.evaluate('f_logout()');
      },
    },
    {
      title: 'Closing Chrome',
      task: async (ctx) => {
        await ctx.browser.close();
      },
    },
    // One day we will actuall start the shell...
    // {
    //   title: 'Check the version of the JRE',
    //   task: async () => {
    //     const { stdout } = await execa(process.env.IDRAC_JRE_JAVA_PATH, [
    //       '--version',
    //     ]);
    //     logger.info(stdout);
    //   },
    // },
  ]);

  await tasks.run();
}

main().catch((err) => {
  logger.error(err);
});
