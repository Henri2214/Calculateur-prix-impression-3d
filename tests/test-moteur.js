/*
 * Tests du moteur de calcul (index.html) avec Playwright.
 *   npm install && npx playwright install chromium && npm test
 * Variable facultative : CHROMIUM_PATH=/chemin/vers/chromium pour réutiliser un navigateur existant.
 */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0, total = 0;
function check(label, cond, detail) {
  total++;
  if (!cond) fails++;
  console.log((cond ? 'OK   ' : 'FAIL ') + label + (detail ? ' — ' + detail : ''));
}
const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;

(async () => {
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(opts);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(300);

  const set = (id, v) => page.evaluate(([id, v]) => {
    const e = document.getElementById(id);
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, v]);
  const setParts = list => page.evaluate(l => { parts = l; renderParts(); recalc(); }, list);
  const part = (o) => Object.assign({ id: 1, name: 'Pièce', mat: 'PLA', g: 100, h: 5, min: 0, perPlate: 1, qty: 1, post: 0 }, o);

  // Configuration de référence : coût machine imposé, marge 0, aucun frais
  await page.evaluate(() => { document.getElementById('wearAuto').checked = false; toggleWear(); });
  for (const [id, v] of Object.entries({
    wearManual: 0.5, prixElec: 0.25, pAvg: 100, pPeak: 600, preheatMin: 6, chamberW: 0, ambient: 1,
    failRate: 0, wastePct: 0, discount: 0, marge: 0, minOrder: 0, shipping: 0, fixedFees: 0,
    designH: 2, designM: 0, designAmort: 1, rateDesign: 40, prepH: 0, prepM: 0, rounding: 0.01
  })) await set(id, String(v));

  // --- 1. Une pièce ------------------------------------------------------
  console.log('\n[1] Une pièce, marge 0');
  await setParts([part({})]);
  let r = await page.evaluate(() => { const x = compute(); return { mat: x.sMat, elec: x.sElec, mach: x.sMach, fixe: x.fixedTotal, cout: x.costTotal, ht: x.totalHT }; });
  check('filament 100 g à 22 €/kg', near(r.mat, 2.2), r.mat.toFixed(4));
  check('électricité (100 W x 5 h + 600 W x 6 min) à 0,25 €/kWh', near(r.elec, 0.14), r.elec.toFixed(4));
  check('usure 5 h x 0,50 €/h', near(r.mach, 2.5), r.mach.toFixed(4));
  check('coût fixe = 2 h de CAO à 40 €/h', near(r.fixe, 80), r.fixe.toFixed(4));
  check('total HT = coût de revient (marge 0)', near(r.ht, 84.84) && near(r.cout, 84.84), r.ht.toFixed(2));

  // --- 2. Le dessin n'est pas compté x fois ------------------------------
  console.log('\n[2] 10 pièces, 1 par plateau');
  await setParts([part({ qty: 10 })]);
  r = await page.evaluate(() => { const x = compute(); return { mat: x.sMat, h: x.totPrintH, ht: x.totalHT, fixe: x.fixedTotal }; });
  check('matière = 10 x 2,20 €', near(r.mat, 22, 0.01), r.mat.toFixed(2));
  check('temps machine = 50 h', near(r.h, 50, 0.01), r.h + ' h');
  check('coût fixe inchangé (dessin compté une seule fois)', near(r.fixe, 80), r.fixe.toFixed(2));
  check('total = 22 + 1,40 + 25 + 80', near(r.ht, 128.4, 0.02), r.ht.toFixed(2));

  // --- 3. Plateaux partagés ---------------------------------------------
  console.log('\n[3] 10 pièces, 5 par plateau');
  await setParts([part({ qty: 10, perPlate: 5 })]);
  r = await page.evaluate(() => { const x = compute(); return { pl: x.lines[0].plates, h: x.totPrintH, mat: x.sMat }; });
  check('2 lancements', r.pl === 2, String(r.pl));
  check('temps machine = 10 h (pas 50 h)', near(r.h, 10, 0.01), r.h + ' h');
  check('matière inchangée', near(r.mat, 22, 0.01), r.mat.toFixed(2));

  await setParts([part({ qty: 11, perPlate: 5 })]);
  r = await page.evaluate(() => compute().lines[0].plates);
  check('11 pièces à 5 par plateau = 3 lancements', r === 3, String(r));

  // --- 4. Échec et perte matière ----------------------------------------
  console.log('\n[4] Taux d\'échec 20 % + perte matière 10 %');
  await setParts([part({})]);
  await set('failRate', '20'); await set('wastePct', '10');
  r = await page.evaluate(() => { const x = compute(); return { mat: x.sMat, mach: x.sMach, post: x.sPost }; });
  check('matière = 100 g x 1,10 x 22 €/kg / 0,8', near(r.mat, 3.025), r.mat.toFixed(4));
  check('usure = 2,50 € / 0,8', near(r.mach, 3.125), r.mach.toFixed(4));
  await setParts([part({ post: 30 })]);
  await set('ratePost', '25');
  r = await page.evaluate(() => compute().sPost);
  check('post-traitement non soumis à l\'échec (30 min x 25 €/h)', near(r, 12.5), r.toFixed(4));

  // --- 5. Multi-lignes ---------------------------------------------------
  console.log('\n[5] Devis multi-lignes');
  await set('failRate', '8'); await set('wastePct', '8'); await set('marge', '30');
  await set('prepM', '20'); await set('fixedFees', '2'); await set('rounding', '0.1');
  await setParts([
    part({ id: 1, name: 'Boîtier', mat: 'PETG', g: 120, h: 6, min: 30, perPlate: 2, qty: 6, post: 5 }),
    part({ id: 2, name: 'Capot', mat: 'ASA', g: 60, h: 3, min: 0, perPlate: 4, qty: 12, post: 3 }),
    part({ id: 3, name: 'Joint', mat: 'TPU 95A', g: 8, h: 0, min: 45, perPlate: 8, qty: 24, post: 0 })
  ]);
  r = await page.evaluate(() => {
    const x = compute();
    return { lines: x.lines.map(l => ({ n: l.p.name, pl: l.plates, tot: l.total })), svc: x.svcLines.map(l => l.total), ht: x.totalHT, cout: x.costTotal, marge: x.grossMargin };
  });
  check('3 lignes, 3 lancements chacune', r.lines.length === 3 && r.lines.every(l => l.pl === 3), JSON.stringify(r.lines.map(l => l.pl)));
  const sum = r.lines.reduce((s, l) => s + l.tot, 0) + r.svc.reduce((s, v) => s + v, 0);
  check('somme des lignes = total HT', near(sum, r.ht), sum.toFixed(2) + ' / ' + r.ht.toFixed(2));
  check('prix de vente supérieur au coût de revient', r.ht > r.cout && r.marge > 0, r.ht.toFixed(2) + ' > ' + r.cout.toFixed(2));

  // --- 6. Mode « tout compris » -----------------------------------------
  console.log('\n[6] Mode tout compris');
  await set('dMode', 'allin');
  r = await page.evaluate(() => { const x = compute(); return { svc: x.svcLines.length, sum: x.lines.reduce((s, l) => s + l.total, 0), ht: x.totalHT }; });
  check('aucune ligne de service séparée', r.svc === 0, String(r.svc));
  check('somme des lignes = total HT', near(r.sum, r.ht), r.sum.toFixed(2) + ' / ' + r.ht.toFixed(2));
  await set('dMode', 'detail');

  // --- 7. Facture --------------------------------------------------------
  console.log('\n[7] Facture');
  await page.evaluate(() => {
    document.getElementById('eName').value = 'Atelier Exemple';
    document.getElementById('eSiren').value = '123456789';
    document.getElementById('cName').value = 'Client Exemple SARL';
    document.getElementById('cSiren').value = '987654321';
    document.getElementById('dDate').value = '2026-11-03';
    openDoc('facture');
  });
  let doc = await page.evaluate(() => ({ txt: document.getElementById('doc').innerText, num: document.getElementById('dNum').value }));
  check('numéro séquentiel FA-AAAA-NNNN', /^FA-\d{4}-\d{4}$/.test(doc.num), doc.num);
  for (const m of ['TVA non applicable, article 293 B du CGI', 'Escompte pour paiement anticipé : néant', 'Indemnité forfaitaire pour frais de recouvrement en cas de retard : 40 €', 'SIREN 123456789', 'SIREN 987654321', 'Net à payer', 'Nature de l\'opération'])
    check('mention « ' + m + ' »', doc.txt.includes(m));
  await page.evaluate(() => { const e = document.getElementById('dDate'); e.value = '2027-03-15'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  doc = await page.evaluate(() => ({ txt: document.getElementById('doc').innerText }));
  check('bascule au 1er janvier 2027 : art. L. 233-1 du CIBS', doc.txt.includes('L. 233-1 du CIBS') && !doc.txt.includes('293 B'));
  await page.evaluate(() => { document.getElementById('cType').value = 'part'; renderDoc(); });
  doc = await page.evaluate(() => ({ txt: document.getElementById('doc').innerText }));
  check('client particulier : pas d\'indemnité forfaitaire de 40 €', !doc.txt.includes('Indemnité forfaitaire'));
  await page.evaluate(() => { document.getElementById('dVat').value = '20'; renderDoc(); });
  doc = await page.evaluate(() => ({ txt: document.getElementById('doc').innerText }));
  check('TVA 20 % : ligne TTC, plus de mention de franchise', doc.txt.includes('Total TTC') && !doc.txt.includes('293 B') && !doc.txt.includes('L. 233-1'));

  // --- 8. Devis ----------------------------------------------------------
  console.log('\n[8] Devis');
  await page.evaluate(() => { document.getElementById('dVat').value = '0'; openDoc('devis'); });
  doc = await page.evaluate(() => ({ txt: document.getElementById('doc').innerText, num: document.getElementById('dNum').value }));
  check('numéro DE-AAAA-NNNN', /^DE-\d{4}-\d{4}$/.test(doc.num), doc.num);
  check('bloc « Bon pour accord »', doc.txt.includes('Bon pour accord'));
  await page.evaluate(() => closeDoc());

  // --- 9. Base de machines ----------------------------------------------
  console.log('\n[9] Base de machines');
  const db = await page.evaluate(() => {
    const all = Object.values(MACHINES).flat();
    return { n: all.length, brands: Object.keys(MACHINES).length,
             bad: all.filter(m => !(m.pAvg > 0 && m.pPeak >= m.pAvg && m.pIdle >= 0 && m.price > 0 && m.life > 0)).map(m => m.m) };
  });
  check('52 machines, 13 marques', db.n === 52 && db.brands === 13, db.n + ' / ' + db.brands);
  check('chaque fiche est cohérente (pic >= moyenne, prix et durée > 0)', db.bad.length === 0, db.bad.join(', '));
  await page.evaluate(() => {
    document.getElementById('wearAuto').checked = true; toggleWear();
    document.getElementById('mBrand').value = 'Prusa Research'; onBrand();
    document.getElementById('mModel').value = '3'; onModel();
  });
  const sp = await page.evaluate(() => ({ name: machineName(), p: +document.getElementById('pAvg').value, price: +document.getElementById('mPrice').value }));
  check('sélection marque → modèle remplit les valeurs', sp.name === 'Prusa Research CORE One' && sp.p === 120 && sp.price === 1250, sp.name + ' ' + sp.p + ' W ' + sp.price + ' €');

  // --- 10. Persistance ---------------------------------------------------
  console.log('\n[10] Persistance');
  const snap = await page.evaluate(() => JSON.parse(JSON.stringify(snapshot())));
  check('snapshot JSON complet', snap.v === 2 && snap.parts.length === 3 && snap.materials.length >= 12);

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));

  console.log('\n' + (fails ? fails + ' échec(s) sur ' + total : 'Tous les tests passent (' + total + ')'));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
