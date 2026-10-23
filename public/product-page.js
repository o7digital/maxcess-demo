import { localizedHtml as html, translateText } from './localization.js';

// Product copy is translated through the same dictionaries as the application.
export function productPage() {
  document.title = 'Service Hub · ' + translateText('Every request. A clear owner. A visible next step.');
  document.querySelector('meta[name="description"]')?.setAttribute('content', translateText('Bring customer requests, field interventions and internal operations into one workspace. Your team knows what to do. Your customers know where things stand.'));
  return html`<div class="product-story">
    <section class="story-hero" aria-labelledby="product-title">
      <div class="story-copy"><p class="eyebrow">SERVICE HUB · O7 DIGITAL GROUP</p>
        <h1 id="product-title">Every request. A clear owner. A visible next step.</h1>
        <p class="story-lead">Bring customer requests, field interventions and internal operations into one workspace. Your team knows what to do. Your customers know where things stand.</p>
        <div class="actions"><a class="btn lime" href="/signup">Start 12 days free ↗</a><a class="btn" href="#how-it-works">See how it works ↓</a></div>
        <p class="story-trial">No card required. After the trial, your data stays available in read-only mode until you subscribe.</p>
      </div>
      <aside class="story-board" aria-label="Example request workflow">
        <div class="story-board-head"><span class="mini-logo">S</span><b>Service Hub</b><span class="story-example">Example workflow</span></div>
        <div class="story-request"><span class="eyebrow">01 · REQUEST</span><h3>A store needs an intervention.</h3><p>One request with its site, priority, photos and documents.</p></div>
        <div class="story-request"><span class="eyebrow">02 · ACTION</span><h3>The right team takes ownership.</h3><p>Assign a responsible person, set a deadline and track progress.</p></div>
        <div class="story-request"><span class="eyebrow">03 · RESOLUTION</span><h3>Everyone sees the outcome.</h3><p>Keep the conversation, evidence and resolution together.</p></div>
      </aside>
    </section>
    <section class="story-section" id="how-it-works" aria-labelledby="workflow-title">
      <p class="eyebrow">FROM REQUEST TO RESOLUTION</p><h2 id="workflow-title">Less chasing. More progress.</h2>
      <p class="story-intro">Replace scattered messages and spreadsheets with a shared process, adapted to the way your organisation works.</p>
      <div class="story-grid story-features">
        <article><span class="story-number">01</span><h3>Capture the whole picture</h3><p>Organise requests by customer and site. Add forms, priorities, comments, PDF files, spreadsheets and photos.</p></article>
        <article><span class="story-number">02</span><h3>Coordinate your team</h3><p>Assign responsibilities, define stages and follow service deadlines. Give customers and staff access through their roles.</p></article>
        <article><span class="story-number">03</span><h3>Make informed decisions</h3><p>Follow workload and progress in dashboards and reports. Olivia helps prepare responses and summaries; your team reviews and decides.</p></article>
      </div>
    </section>
    <section class="story-section story-sectors" aria-labelledby="sectors-title">
      <p class="eyebrow">ONE PLATFORM, DIFFERENT OPERATIONS</p><h2 id="sectors-title">Built around your work, beyond support.</h2>
      <div class="story-grid story-sector-grid">
        <article><h3>Customer service & retail</h3><p>Coordinate a contact centre, customer requests and interventions across multiple branches.</p></article>
        <article><h3>Software & IT</h3><p>Track support tickets, bugs, access requests and technical interventions.</p></article>
        <article><h3>Construction & field services</h3><p>Follow site issues, corrective work and contractor interventions, with photos and supporting documents.</p></article>
        <article><h3>Healthcare administration</h3><p>Coordinate administrative requests, equipment maintenance and internal services.</p></article>
        <article><h3>Legal & professional services</h3><p>Organise client requests, document collection and administrative case follow-up.</p></article>
      </div>
      <p class="story-scope">Specialist workflows can be configured around your needs. Health records, privileged legal files and other sensitive data require a separate assessment and appropriate safeguards before use.</p>
    </section>
    <section class="story-section story-integrations" id="integrations" aria-labelledby="integrations-title">
      <div><p class="eyebrow">KEEP YOUR EXISTING TOOLS</p><h2 id="integrations-title">Zendesk and ServiceNow integrations included.</h2><p>Connect your existing instance and send or update selected Service Hub tickets in Zendesk or ServiceNow. Your team controls each export.</p><p class="story-scope">An authorised account and API access from the provider are required. Provider subscriptions remain separate. Full automatic two-way synchronisation requires an agreed configuration and scope.</p></div>
      <div class="story-integration-list"><div><b>Zendesk</b><span>Ticket creation & updates</span></div><div><b>ServiceNow</b><span>Incident creation & updates</span></div><div><b>CSV · Excel</b><span>Start with your existing data</span></div></div>
    </section>
    <section class="story-section story-start" aria-labelledby="start-title"><div><p class="eyebrow">YOUR PROCESS, YOUR WORKSPACE</p><h2 id="start-title">Start small. Make it yours. Grow with your team.</h2><p>Create your workspace, configure your services and invite your team. Explore the workflow during a 12-day trial before choosing your user plan.</p></div><a class="btn lime" href="/signup">Create my workspace ↗</a></section>
  </div>`;
}
