1. sorting/filtering in omni-find

2) html/xml preview  a la open knowledge not working, for example:
   ```html
   <div style="font-family:system-ui,sans-serif;padding:20px;color:var(--foreground)">
     <h3 style="margin:0 0 14px;font-size:15px;font-weight:600">Revenue by region</h3>
     <div id="bars" style="display:flex;align-items:flex-end;gap:14px;height:170px"></div>
     <script>
       var data = [['North', 42], ['South', 58], ['East', 71], ['West', 64], ['Central', 80]];
       var max = Math.max.apply(null, data.map(function (d) { return d[1]; }));
       document.getElementById('bars').innerHTML = data.map(function (d, i) {
         return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;' +
           'gap:6px;height:100%;justify-content:flex-end">' +
           '<span style="font-size:12px;font-weight:600">' + d[1] + '</span>' +
           '<div style="width:100%;height:' + (d[1] / max * 100) + '%;' +
           'background:var(--chart-' + (i + 1) + ');' +
           'border-radius:var(--radius) var(--radius) 0 0"></div>' +
           '<span style="font-size:12px;color:var(--muted-foreground)">' + d[0] + '</span>' +
           '</div>';
       }).join('');
     </script>
   </div>
   ```
3) error toast: `https://svelte.dev/e/each_key_duplicate`when searching ‘card’ in tokens
4) **scroll position jumping around when switching tabs (looks like either top or bottom of the page - including when dialog**
