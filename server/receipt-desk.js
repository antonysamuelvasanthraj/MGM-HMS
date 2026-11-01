/** Snapshot attribution of scheme line receipts; sales remain attributed to the original bill/items. */
export const receiptDeskSql=(payment='p',bill='b')=>`coalesce((SELECT x.collection_desk FROM scheme_line_collections x WHERE x.payment_id=${payment}.id LIMIT 1),CASE WHEN ${bill}.bill_type='PHARM' THEN 'pharmacy' ELSE 'reception' END)`;
