import fs from "node:fs/promises";

const login = process.env.PROFILE_USER || "jhonwictordev";
const token = process.env.GITHUB_TOKEN;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "profile-visuals", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const out = new URL("../../assets/generated/", import.meta.url);
await fs.mkdir(out, { recursive: true });

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

const repos = (await api(`https://api.github.com/users/${login}/repos?per_page=100&type=owner&sort=updated`)).filter((repo) => !repo.fork && repo.name !== login);
const languageMaps = await Promise.all(repos.map((repo) => api(repo.languages_url).catch(() => ({}))));
const languages = {};
for (const map of languageMaps) for (const [name, bytes] of Object.entries(map)) languages[name] = (languages[name] || 0) + bytes;

const today = new Date();
const from = new Date(today); from.setUTCFullYear(today.getUTCFullYear() - 1); from.setUTCDate(from.getUTCDate() + 1);
let contributions = { total: 0, commits: 0, prs: 0, issues: 0, days: [] };
if (token) {
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){totalCommitContributions totalIssueContributions totalPullRequestContributions contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}}}`;
  const data = await api("https://api.github.com/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: today.toISOString() } }) });
  const collection = data.data?.user?.contributionsCollection;
  if (collection) contributions = { total: collection.contributionCalendar.totalContributions, commits: collection.totalCommitContributions, prs: collection.totalPullRequestContributions, issues: collection.totalIssueContributions, days: collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays) };
}

const palette = { bg: "#0b0b0b", panel: "#101010", text: "#f7f7f2", muted: "#9e9e99", soft: "#686866", line: "#292929", accent: "#ff6b45" };
const shell = (width, height, body, title, description) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${description}</desc><rect width="${width}" height="${height}" rx="3" fill="${palette.bg}"/><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="2.5" fill="none" stroke="${palette.line}"/><style>text{font-family:Inter,Segoe UI,Arial,sans-serif}.label{font-size:11px;letter-spacing:1.5px;fill:${palette.muted}}.value{font-size:25px;font-weight:700;fill:${palette.text}}.small{font-size:12px;fill:${palette.muted}}</style>${body}</svg>`;
const metric = (x, label, value) => `<text x="${x}" y="94" class="value">${value}</text><text x="${x}" y="118" class="label">${label}</text>`;

const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
const statsBody = `<path d="M0 4h104" stroke="${palette.accent}" stroke-width="8"/><text x="25" y="42" class="label" fill="${palette.accent}">PROFILE TELEMETRY / LAST 12 MONTHS</text>${metric(25, "PUBLIC REPOS", repos.length)}${metric(145, "CONTRIBUTIONS", contributions.total || "—")}${metric(300, "COMMITS", contributions.commits || "—")}<text x="25" y="161" class="small">Pull requests ${contributions.prs || "—"}  ·  Issues ${contributions.issues || "—"}  ·  Stars ${totalStars}</text>`;
await fs.writeFile(new URL("profile-stats.svg", out), shell(460, 190, statsBody, "GitHub profile statistics", "Repository and contribution totals refreshed daily."));

const sortedLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 6);
const totalBytes = sortedLanguages.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
const languageColors = ["#ff6b45", "#db5b3b", "#b84c32", "#913d29", "#6d3023", "#4b251e"];
let languageBody = `<path d="M0 4h104" stroke="${palette.accent}" stroke-width="8"/><text x="25" y="42" class="label">LANGUAGES / OWN REPOSITORIES</text>`;
sortedLanguages.forEach(([name, bytes], index) => {
  const y = 69 + index * 19; const percent = (bytes / totalBytes) * 100;
  languageBody += `<circle cx="29" cy="${y - 4}" r="4" fill="${languageColors[index]}"/><text x="41" y="${y}" class="small" fill="${palette.text}">${name}</text><rect x="170" y="${y - 10}" width="190" height="7" rx="1" fill="${palette.panel}"/><rect x="170" y="${y - 10}" width="${Math.max(2, percent * 1.9).toFixed(1)}" height="7" rx="1" fill="${languageColors[index]}"/><text x="372" y="${y}" class="small">${percent.toFixed(1)}%</text>`;
});
await fs.writeFile(new URL("top-languages.svg", out), shell(460, 190, languageBody, "Most used languages", "Language distribution across original public repositories."));

const dayMap = new Map(contributions.days.map((day) => [day.date, day.contributionCount]));
const weeks = [];
for (let week = 51; week >= 0; week--) {
  const start = new Date(today); start.setUTCDate(today.getUTCDate() - today.getUTCDay() - week * 7);
  weeks.push(Array.from({ length: 7 }, (_, weekday) => { const date = new Date(start); date.setUTCDate(start.getUTCDate() + weekday); return dayMap.get(date.toISOString().slice(0, 10)) || 0; }));
}
const cellColor = (count) => count === 0 ? "#171717" : count < 3 ? "#4b251e" : count < 6 ? "#913d29" : count < 10 ? "#c65336" : palette.accent;
let graphBody = `<path d="M0 4h104" stroke="${palette.accent}" stroke-width="8"/><text x="25" y="42" class="label">CONTRIBUTION ACTIVITY / 52 WEEKS</text>`;
weeks.forEach((week, x) => week.forEach((count, y) => { graphBody += `<rect x="${32 + x * 21}" y="${62 + y * 17}" width="13" height="13" rx="2" fill="${cellColor(count)}"/>`; }));
graphBody += `<text x="32" y="204" class="small">${contributions.total ? contributions.total + " contributions in the last year" : "Contribution data refreshes through GitHub Actions"}</text>`;
await fs.writeFile(new URL("activity-graph.svg", out), shell(1200, 225, graphBody, "Contribution activity", "Contribution grid for the last 52 weeks."));

const activeDays = contributions.days.filter((day) => day.date <= today.toISOString().slice(0, 10));
let longest = 0, running = 0;
for (const day of activeDays) { running = day.contributionCount > 0 ? running + 1 : 0; longest = Math.max(longest, running); }
let current = 0;
for (let index = activeDays.length - 1; index >= 0; index--) { if (activeDays[index].contributionCount > 0) current++; else if (index === activeDays.length - 1) continue; else break; }
const streakBody = `<path d="M0 4h104" stroke="${palette.accent}" stroke-width="8"/><text x="28" y="42" class="label">CONSISTENCY</text><text x="82" y="103" class="value">${current || "—"}</text><text x="53" y="128" class="label">CURRENT STREAK</text><path d="M250 58v88" stroke="${palette.line}"/><text x="355" y="103" class="value">${longest || "—"}</text><text x="329" y="128" class="label">LONGEST STREAK</text><path d="M550 58v88" stroke="${palette.line}"/><text x="713" y="103" class="value">${contributions.total || "—"}</text><text x="668" y="128" class="label">YEARLY ACTIVITY</text><text x="925" y="103" fill="${palette.accent}" font-size="38" font-weight="700">↗</text><text x="925" y="128" class="label">KEEP BUILDING</text>`;
await fs.writeFile(new URL("streak.svg", out), shell(1200, 170, streakBody, "Contribution streak", "Current streak, longest streak and yearly contribution total."));

console.log(`Generated profile visuals for ${login}: ${repos.length} repositories, ${contributions.total} contributions.`);
