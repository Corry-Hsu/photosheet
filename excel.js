/* ExcelJS is used for both cached-value import and editable document export. */
window.readExcel = async function (raw) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(raw);
  function value(v) {
    if (
      v === null ||
      v === undefined ||
      typeof v !== "object" ||
      v instanceof Date
    )
      return v;
    if ("result" in v) return value(v.result);
    if (v.error) return v.error;
    if (Array.isArray(v.richText))
      return v.richText.map((x) => x.text || "").join("");
    if (typeof v.text === "string") return v.text;
    return null; // Formulas without cached results are not evaluated.
  }
  const sheets = {};
  for (const name of ["砍樹", "圍籬", "雜草垃圾"]) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    if (ws.rowCount > 30000) throw Error("單一工作表超過30,000列");
    const rows = [];
    ws.eachRow((row, number) => {
      const cells = [];
      row.eachCell((cell, col) => {
        cells[col - 1] = value(cell.value);
      });
      rows[number - 1] = cells;
    });
    sheets[name] = rows;
  }
  return PSCore.parseExcelRows(sheets);
};
