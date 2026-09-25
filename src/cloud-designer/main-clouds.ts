// src/cloud-designer/main-clouds.ts — clouds.html is no longer the authoring page

const host = document.getElementById('clouds-app');
const loading = document.getElementById('loading');
if (loading) loading.classList.add('hidden');
if (host) {
  host.hidden = false;
  host.innerHTML = `
    <p style="font-family:Georgia,serif;padding:2em;max-width:36em">
      Cumulus decks are authored on the map.
      Open the map editor, edit Clouds, and save the map.
    </p>
    <p style="font-family:Georgia,serif;padding:0 2em">
      <a href="/editor.html" style="color:#e8d7b0">Open map editor</a>
    </p>
  `;
}
