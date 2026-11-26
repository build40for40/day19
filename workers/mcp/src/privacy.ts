// The privacy policy at /privacy. Google needs a link to one before the app can be
// published, and it has to say plainly what we do with Google user data.

export const PRIVACY_UPDATED = "26 November 2026";

export const privacyBody = `<h1>Privacy</h1>
<p class="muted">Last updated ${PRIVACY_UPDATED}</p>

<p>This is Gobbler, built on day 19 of <a href="https://build40for40.com">40 for 40</a>: a game for your Google Contacts that you play inside Claude or ChatGPT. Each day it shows you a few contacts. You keep each one by saying what you're grateful for, or you let them go.</p>

<h2>What we read</h2>
<p>When you sign in with Google, you let us see and edit your Google Contacts. We read each contact's name, email addresses, phone numbers, photo, organisation, labels, birthday and notes, plus your own name and email address so we know whose contacts these are.</p>
<p>We don't read your email, your calendar or anything else in your Google account.</p>

<h2>What we store</h2>
<ul>
<li>A copy of your contacts, so the game can pick today's five.</li>
<li>Every decision you make, and the gratitude you write for the people you keep.</li>
<li>A full copy of anyone you let go, saved before they're deleted, so nobody is ever truly lost.</li>
</ul>
<p>All of this sits in your own private store on Cloudflare, which runs the app. Your Google sign-in is kept encrypted there too and is never shared with Claude or ChatGPT.</p>

<h2>What we change</h2>
<p>When you let someone go, we delete them from your Google Contacts. That also removes them from any phone synced to that Google account. Nothing is deleted unless you choose it for that person.</p>
<p>When you keep someone, they stay in your Google Contacts exactly as they are.</p>

<h2>What the assistant sees</h2>
<p>The contacts you play with, and the gratitude you write, are shown to the assistant you play in (Claude or ChatGPT) so it can show the game and talk about it with you. What happens to your chats there is covered by that assistant's own privacy policy.</p>

<h2>What we never do</h2>
<ul>
<li>Send anything to your contacts. Saying thanks is the point, sending it is up to you.</li>
<li>Sell your data, share it with anyone else, or use it for ads.</li>
<li>Use your data to train AI models.</li>
</ul>
<p>Our use of information received from Google APIs follows the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>

<h2>Leaving</h2>
<ul>
<li>Remove the connector in Claude or ChatGPT.</li>
<li>Take away our access to your Google account at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</li>
<li>Email <a href="mailto:hello@40for40.app">hello@40for40.app</a> and we'll delete everything we store about you.</li>
</ul>

<h2>Questions</h2>
<p>Email <a href="mailto:hello@40for40.app">hello@40for40.app</a>.</p>
<p><a href="./">Back to the app</a></p>`;
