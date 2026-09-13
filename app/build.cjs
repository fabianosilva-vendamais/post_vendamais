for (const d of ['engine', 'assets']) if (fs.existsSync(d)) fs.cpSync(d, o + '/' + d, { recursive: true });
for (const f of ['support.js', 'simulacao.js', 'Simulacao - Radar Ed01.html']) if (fs.existsSync(f)) fs.cpSync(f, o + '/' + f);
