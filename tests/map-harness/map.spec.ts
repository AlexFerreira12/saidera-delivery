import{test,expect}from"@playwright/test";
for(const device of[{name:"mobile",width:375,height:812},{name:"desktop",width:1280,height:800}]){
 test(`map renders and aligns on ${device.name}`,async({page})=>{
  await page.setViewportSize({width:device.width,height:device.height});
  await page.route("https://tile.openstreetmap.org/**",route=>route.abort());
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const point=page.getByLabel("Mapa para escolher o ponto de entrega");
  const polygon=page.getByLabel("Mapa para desenhar a área de entrega");
  await expect(point).toBeVisible();await expect(polygon).toBeVisible();
  const pb=await polygon.boundingBox();const svg=await polygon.locator("svg").boundingBox();
  expect(pb?.height).toBe(256);expect(svg?.width).toBeCloseTo(pb!.width,0);expect(svg?.height).toBeCloseTo(pb!.height,0);
  await expect(polygon.locator("polygon")).toHaveCount(1);
  const box=await point.boundingBox();await point.click({position:{x:box!.width*.6,y:box!.height*.45}});
  await expect(point.getByLabel("Ponto escolhido")).toBeVisible();
 });
}