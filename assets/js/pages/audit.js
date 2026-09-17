import { $, db, esc, table } from "../app.js";
$("list").innerHTML = table(
  ["Time", "Action", "Detail"],
  db.audit.map(
    (x) =>
      `<tr><td>${esc(new Date(x.at).toLocaleString())}</td><td>${esc(x.action)}</td><td>${esc(x.detail)}</td></tr>`,
  ),
);
