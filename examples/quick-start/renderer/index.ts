import "./samples";

document.getElementById("app")!.innerHTML = `
<h1>Hi there 👋</h1>
<p>Now, you can use Electron and Node.js API in Renderer process.</p>
<pre>
  import { ipcRenderer } from 'electron';
  import fs from 'node:fs';
</pre>
`;
