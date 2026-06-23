const http = require("node:http");

const PAGES = {
  "/logged-in-courses": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens Logged-in Courses Fixture</title></head>
      <body>
        <header id="gradual-topbar" data-testid="topbar">
          <a href="/home">OpenAI Academy</a>
          <button>Search</button>
          <input type="search" placeholder="Search" />
          <button>Notifications</button>
          <button data-testid="account-menu">Account</button>
        </header>
        <aside id="gradual-sidebar" role="navigation" aria-label="sidebar-menus">
          <a href="/home">Home</a>
          <a href="/home/events">Events</a>
          <a href="/pages/courses?linkMenu=Courses">Courses</a>
          <a href="/home/content">Content</a>
          <a href="/home/clubs">Communities</a>
          <a href="/public/collections/whats-new">What's new</a>
          <a href="/public/clubs/small-business">Small business</a>
          <a href="/public/clubs/nonprofits">Nonprofits</a>
          <a href="/public/clubs/government">Government</a>
          <a href="/public/clubs/news-organizations">News organizations</a>
          <a href="/help">Help</a>
          <a href="https://www.gradual.com">Powered by Gradual</a>
        </aside>
        <main>
          <section data-testid="courses-hero">
            <h1 id="courses-title">OpenAI Academy Courses</h1>
            <p id="courses-subtitle">Earn your OpenAI Course Completion Certificates</p>
          </section>
          <section aria-label="Courses">
            <article data-testid="course-card">
              <p id="course-fit-1">Great for people new to AI</p>
              <h2 id="course-title-1">AI Foundations</h2>
              <p id="course-summary-1">Build practical skills for working with AI</p>
              <a id="course-cta-1" href="/public/courses/ai-foundations">Start learning</a>
            </article>
            <article data-testid="course-card">
              <p id="course-fit-2">Great for people who have some AI experience</p>
              <h2 id="course-title-2">Prompt Engineering</h2>
              <p id="course-summary-2">Practice writing clear instructions, context, and review criteria.</p>
              <a id="course-cta-2" href="/public/courses/prompt-engineering">Start learning</a>
            </article>
            <article data-testid="course-card">
              <p id="course-fit-3">Great for people who use AI at work</p>
              <h2 id="course-title-3">Building with Agents</h2>
              <p id="course-summary-3">Learn how workflows, tools, and review steps help teams use agents responsibly.</p>
              <a id="course-cta-3" href="/public/courses/building-with-agents">Start learning</a>
            </article>
          </section>
        </main>
      </body>
    </html>`,
  "/course": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens Course Fixture</title></head>
      <body>
        <header id="gradual-topbar">Courses Search Account</header>
        <aside id="gradual-sidebar">Home Events Courses Profile</aside>
        <main id="lesson-main">
          <h1 id="title">Build practical AI skills for work</h1>
          <p id="protected">OpenAI Academy courses use ChatGPT and GPT-5.</p>
          <p id="terms">Artificial intelligence workflows help teams build agents.</p>
          <p id="technical">JSON API examples stay readable.</p>
          <p id="inline">Use <strong>ChatGPT</strong> safely.</p>
          <button id="start-course">Start course</button>
          <pre id="code">const message = "Do not translate code";</pre>
        </main>
        <script>
          window.__replaceWithLessonTwo = function () {
            document.querySelector('main').innerHTML = '<h1 id="title">Advanced prompt engineering</h1><p id="protected">OpenAI Academy lessons use JSON and SDK examples.</p><p id="terms">Prompting workflows improve agent behavior.</p>';
            history.pushState({}, '', '/lesson-2');
          };
        </script>
      </body>
    </html>`,
  "/study-room": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens Study Room Fixture</title></head>
      <body>
        <header id="gradual-topbar">OpenAI Academy Search Notifications Account</header>
        <aside id="gradual-sidebar">Home Events Courses Profile Settings</aside>
        <div class="course-progress" role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100">
          2/5 Lessons Completed
        </div>
        <nav aria-label="Table of Contents">
          <span>Show Table of Contents</span>
          <span>Lesson 2 of 5</span>
          <span>Complete</span>
        </nav>
        <aside class="certificate-panel" data-testid="certificate-card">
          <h2 id="certificate-title">Course Certificate</h2>
          <button>View Certificate</button>
          <button>Download PDF</button>
        </aside>
        <section class="account-menu" data-testid="account-menu">
          <span>Profile</span>
          <span>Settings</span>
          <span>Sign in</span>
        </section>
        <form class="quiz-panel" data-testid="lesson-quiz">
          <h2 id="quiz-title">Quiz Results</h2>
          <label>Time limit</label>
          <button>Start quiz</button>
          <button>Submit</button>
        </form>
        <main data-testid="course-study-room">
          <article data-testid="lesson-content">
            <header class="lesson-header">
              <h1 id="study-title">Build practical AI skills for work</h1>
            </header>
            <p id="study-models">Large language models can help draft repeatable workflows.</p>
            <p id="study-review">Review points help teams evaluate outputs responsibly.</p>
            <ul>
              <li id="study-context">Set clear context before using ChatGPT.</li>
              <li id="study-agents">Reusable prompts help agents follow boundaries.</li>
            </ul>
          </article>
        </main>
      </body>
    </html>`,
  "/live-lesson-shell": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens Live Lesson Shell Fixture</title></head>
      <body>
        <header id="gradual-topbar">
          <a href="/home">OpenAI Academy</a>
          <button>Search</button>
          <button>Notifications</button>
          <button data-testid="account-menu">Account</button>
        </header>
        <aside id="gradual-sidebar" role="navigation" aria-label="Course navigation">
          <a href="/home">Home</a>
          <a href="/home/courses">Courses</a>
          <a href="/learn/ai-foundations-juzjs/lessons/intro">Introduction</a>
          <a href="/learn/ai-foundations-juzjs/lessons/workflows">Workflows</a>
        </aside>
        <div class="course-progress" role="progressbar" aria-valuenow="57" aria-valuemin="0" aria-valuemax="100">
          4/7 Lessons Completed
        </div>
        <nav aria-label="Table of Contents">
          <span>Lesson 4 of 7</span>
          <button>Complete</button>
          <button>Continue</button>
        </nav>
        <aside data-testid="certificate-card">
          <h2 id="live-certificate">Course Certificate</h2>
          <button>View Certificate</button>
          <button>Download PDF</button>
        </aside>
        <form data-testid="lesson-quiz">
          <h2 id="live-quiz">Knowledge Check</h2>
          <label>Time limit</label>
          <button>Start quiz</button>
          <button>Submit</button>
        </form>
        <main data-testid="course-study-room">
          <article data-testid="lesson-content">
            <p id="live-course">AI Foundations</p>
            <h1 id="live-title">Build practical AI skills for work</h1>
            <p id="live-context">Set clear context before using ChatGPT.</p>
            <p id="live-agents">Reusable prompts help agents follow boundaries.</p>
            <p id="live-review">Review points help teams evaluate outputs responsibly.</p>
            <section aria-labelledby="live-reflection-heading">
              <h2 id="live-reflection-heading">Reflection</h2>
              <p id="live-reflection">Practice deciding what to delegate to AI while staying in control of the final work.</p>
            </section>
            <pre id="live-code">const message = "Do not translate code";</pre>
          </article>
        </main>
        <div role="status" aria-live="polite">Saved</div>
      </body>
    </html>`,
  "/learn/ai-foundations-juzjs/lessons": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens SCORM Shell Fixture</title></head>
      <body>
        <header id="gradual-topbar">
          <a href="/home">Home</a>
          <span>/</span>
          <a href="/home/courses">Courses</a>
          <span>/</span>
          <a href="/home/courses/ai-foundations-juzjs">AI Foundations</a>
          <span>/</span>
          <span>Study Room</span>
          <button>Exit Course</button>
        </header>
        <main>
          <iframe
            id="scorm-driver"
            title="AI Foundations"
            src="/api/courses/ai-foundations-juzjs/scorm-proxy/courses/oaiacademy/demo/scormdriver/indexAPI.html"
          ></iframe>
        </main>
	      </body>
	    </html>`,
  "/learn/ai-foundations-juzjs/lessons-delayed": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens Delayed SCORM Shell Fixture</title></head>
      <body>
        <header id="gradual-topbar">
          <a href="/home">Home</a>
          <span>/</span>
          <span>Study Room</span>
        </header>
        <main id="delayed-frame-root"></main>
        <script>
          setTimeout(() => {
            document.querySelector("#delayed-frame-root").innerHTML = [
              '<iframe',
              ' id="scorm-driver"',
              ' title="AI Foundations"',
              ' src="/api/courses/ai-foundations-juzjs/scorm-proxy/courses/oaiacademy/demo/scormdriver/indexAPI.html"',
              '></iframe>'
            ].join('');
          }, 350);
        </script>
      </body>
    </html>`,
  "/api/courses/ai-foundations-juzjs/scorm-proxy/courses/oaiacademy/demo/scormdriver/indexAPI.html": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>SCORM Driver</title></head>
      <body>
        <iframe id="scorm-content" title="AI Foundations content" src="/api/courses/ai-foundations-juzjs/scorm-proxy/courses/oaiacademy/demo/scormcontent/index.html#/preview"></iframe>
      </body>
    </html>`,
  "/api/courses/ai-foundations-juzjs/scorm-proxy/courses/oaiacademy/demo/scormcontent/index.html": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>SCORM Content</title></head>
      <body>
        <div id="scorm-root"></div>
        <script>
          const root = document.querySelector("#scorm-root");
          function renderPreview() {
            root.innerHTML = [
              '<section id="scorm-hero">',
              '<h1 id="scorm-title">AI Foundations</h1>',
              '<a id="scorm-start" href="#/lessons/welcome">START COURSE</a>',
              '</section>',
              '<section id="scorm-intro">',
              '<h2 id="scorm-provider">OpenAI</h2>',
              '<p id="scorm-body">This course is designed to build foundations for using AI and ChatGPT safely.</p>',
              '<p id="scorm-llm">Large language models help people practice responsible review.</p>',
              '</section>'
            ].join('');
          }
          function renderLesson() {
            root.innerHTML = [
              '<button id="scorm-skip">SKIP TO LESSON</button>',
              '<section id="scorm-lesson">',
              '<h1 id="scorm-lesson-title">1.1 Welcome to AI Foundations</h1>',
              '<iframe id="scorm-media" title="QM_AF-01_v3" src="about:blank"></iframe>',
              '<p id="scorm-lesson-caption">Welcome to the course.</p>',
              '<button id="scorm-continue">CONTINUE</button>',
              '</section>'
            ].join('');
          }
          function render() {
            if (location.hash.startsWith("#/lessons/")) {
              renderLesson();
            } else {
              renderPreview();
            }
          }
          window.addEventListener("hashchange", render);
          render();
        </script>
      </body>
    </html>`,
  "/lesson-2": `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>AcademyLens Lesson 2</title></head>
      <body>
        <header id="gradual-topbar">Courses Search Account</header>
        <main id="lesson-main">
          <h1 id="title">Advanced prompt engineering</h1>
          <p id="protected">OpenAI Academy lessons use JSON and SDK examples.</p>
          <p id="terms">Prompting workflows improve agent behavior.</p>
        </main>
      </body>
    </html>`
};

function startFixtureServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const path = new URL(request.url, "http://localhost").pathname;
      const html = PAGES[path] || PAGES["/course"];
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

function stopFixtureServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

module.exports = {
  startFixtureServer,
  stopFixtureServer
};
