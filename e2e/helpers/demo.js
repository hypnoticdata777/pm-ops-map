/** Open the native disclosure the same way a visitor does. */
export async function openDemoDetails(page) {
  const details = page.locator('#demo-details');
  if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
}
export async function clickDemoButton(page, name) {
  await openDemoDetails(page);
  await page.locator('#demo-banner').getByRole('button', { name, exact: true }).click();
}
