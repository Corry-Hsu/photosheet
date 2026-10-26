(function () {
  let db;
  window.Store = {
    async open() {
      if (!db)
        db = await new Promise((yes, no) => {
          let r = indexedDB.open("photosheet-static-v1", 2);
          r.onupgradeneeded = () => {
            for (const n of ["state", "geo", "photos"])
              if (!r.result.objectStoreNames.contains(n))
                r.result.createObjectStore(n, { keyPath: "id" });
            const photos = r.transaction.objectStore("photos");
            if (!photos.indexNames.contains("personTask"))
              photos.createIndex("personTask", ["person", "taskId"]);
          };
          r.onsuccess = () => yes(r.result);
          r.onerror = () => no(r.error);
        });
      return db;
    },
    async photosFor(person, taskId) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const list = [],
          r = d
            .transaction("photos")
            .objectStore("photos")
            .index("personTask")
            .openCursor(IDBKeyRange.only([person, taskId]));
        r.onsuccess = () => {
          let c = r.result;
          if (c) {
            list.push(c.value);
            c.continue();
          } else yes(list);
        };
        r.onerror = () => no(r.error);
      });
    },
    async put(store, value) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const t = d.transaction(store, "readwrite");
        t.objectStore(store).put(value);
        t.oncomplete = yes;
        t.onerror = () => no(t.error);
        t.onabort = () => no(t.error || Error("儲存取消"));
      });
    },
    async get(store, id) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const r = d.transaction(store).objectStore(store).get(id);
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
    },
    async all(store) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const r = d.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
    },
    writeGeo(transaction, geo) {
      const store = transaction.objectStore("geo");
      store.clear();
      const batchSize = 1000;
      let chunks = 0;
      for (let i = 0; i < geo.features.length; i += batchSize)
        store.put({
          id: "chunk-" + chunks++,
          features: geo.features.slice(i, i + batchSize),
        });
      store.put({ id: "catalogue", chunks, counts: geo.counts });
    },
    async saveGeo(geo) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const t = d.transaction("geo", "readwrite");
        this.writeGeo(t, geo);
        t.oncomplete = yes;
        t.onerror = () => no(t.error);
        t.onabort = () => no(t.error || Error("地籍儲存失敗"));
      });
    },
    async getGeo() {
      const meta = await this.get("geo", "catalogue");
      if (!meta) return null;
      if (meta.features) return meta;
      let features = [];
      for (let i = 0; i < meta.chunks; i++) {
        const chunk = await this.get("geo", "chunk-" + i);
        if (!chunk) throw Error("地籍索引缺少分片，請重新匯入");
        for (const f of chunk.features) features.push(f);
      }
      return { id: "catalogue", features, counts: meta.counts };
    },
    async replaceManager(state, geo) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const t = d.transaction(["state", "geo"], "readwrite");
        t.objectStore("state").put(state);
        this.writeGeo(t, geo);
        t.oncomplete = yes;
        t.onerror = () => no(t.error);
        t.onabort = () => no(t.error || Error("還原失敗"));
      });
    },
    async del(store, id) {
      const d = await this.open();
      return new Promise((yes, no) => {
        const t = d.transaction(store, "readwrite");
        t.objectStore(store).delete(id);
        t.oncomplete = yes;
        t.onerror = () => no(t.error);
      });
    },
  };
})();
