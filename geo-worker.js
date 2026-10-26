importScripts("vendor/fflate.js", "vendor/sax.js", "core.js");
const dec = new TextDecoder();
self.onmessage = async (e) => {
  try {
    const files = e.data.files;
    let lands = new Map(),
      features = new Map(),
      warnings = [],
      counts = { xml: 0, kml: 0, landRecords: 0, placemarks: 0, vertices: 0 },
      total = 0;
    function landFile(text, name) {
      let rows = PSCore.parseLandXML(text, name);
      counts.xml++;
      counts.landRecords += rows.length;
      for (const r of rows) {
        const k = r.code + "|" + r.lot;
        if (!lands.has(k)) lands.set(k, []);
        if (
          !lands
            .get(k)
            .some(
              (x) =>
                PSCore.key(x) === PSCore.key(r) && x.ownership === r.ownership,
            )
        )
          lands.get(k).push(r);
      }
    }
    function kmlFile(text, name) {
      let r = PSCore.parseKML(text, name);
      counts.kml++;
      counts.placemarks += r.features.length;
      warnings.push(...r.warnings);
      for (const f of r.features) {
        f.lands = lands.get(f.code + "|" + f.lot) || [];
        if (!f.lands.length)
          warnings.push(name + "：" + f.code + "/" + f.lot + " 無XML名稱對照");
        const key = f.code + ":" + f.lot;
        if (!features.has(key))
          features.set(key, {
            ...f,
            id: key,
            polygons: [],
            sources: [],
            partHashes: new Set(),
          });
        const merged = features.get(key);
        for (const polygon of f.polygons) {
          const h = JSON.stringify(polygon);
          if (!merged.partHashes.has(h)) {
            merged.partHashes.add(h);
            merged.polygons.push(polygon);
            counts.vertices += polygon.reduce((n, r) => n + r.length, 0);
          }
        }
        if (!merged.sources.includes(f.source)) merged.sources.push(f.source);
      }
    }
    function zipPass(bytes, ext, parse) {
      let unzip = new fflate.Unzip((file) => {
        if (!file.name.toLowerCase().endsWith(ext)) return;
        let chunks = [],
          size = 0;
        file.ondata = (err, data, final) => {
          if (err) throw err;
          size += data.length;
          if (size > 48 * 1024 * 1024)
            throw Error("單一解壓檔超過48MB：" + file.name);
          chunks.push(data);
          if (final) {
            let raw = new Uint8Array(size),
              at = 0;
            for (const c of chunks) {
              raw.set(c, at);
              at += c.length;
            }
            try {
              parse(dec.decode(raw), file.name);
            } catch (err) {
              warnings.push(file.name + "：" + err.message);
            }
            total++;
            if (total % 50 === 0) postMessage({ progress: total, counts });
          }
        };
        file.start();
      });
      unzip.register(fflate.UnzipInflate);
      for (let i = 0; i < bytes.length; i += 65536)
        unzip.push(bytes.subarray(i, i + 65536), i + 65536 >= bytes.length);
    }
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        PSCore.checkArchive(bytes, 1024 * 1024 * 1024, 30000);
        zipPass(bytes, ".xml", landFile);
      } else if (/\.xml$/i.test(file.name)) {
        try {
          landFile(await file.text(), file.name);
        } catch (err) {
          warnings.push(file.name + "：" + err.message);
        }
      }
    }
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        zipPass(bytes, ".kml", kmlFile);
      } else if (/\.kml$/i.test(file.name)) {
        try {
          kmlFile(await file.text(), file.name);
        } catch (err) {
          warnings.push(file.name + "：" + err.message);
        }
      }
    }
    for (const f of features.values()) {
      f.bbox = PSCore.bbox(f.polygons);
      delete f.partHashes;
    }
    postMessage({
      done: true,
      features: [...features.values()],
      warnings,
      counts,
    });
  } catch (e) {
    postMessage({ error: e.message });
  }
};
