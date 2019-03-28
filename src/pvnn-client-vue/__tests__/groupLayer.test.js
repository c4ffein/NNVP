import { Selector } from 'testcafe';

fixture`Grouping Layer`
  .page`http://localhost:8080/`;

test('Group_Layer', async t => {
  await t
    .drag(Selector('#layer-template-Input'), 396, 68, {
      offsetX: 72,
      offsetY: 6
    })
    .click(Selector('#Layer_0').find('text'))
    .click(Selector('#TopBar').find('div').withText('Edit'))
    .click(Selector('#TopBar').find('div').withText('Group'))
    // check if layer is grouped
    .expect(Selector('#Composite_1').visible).ok()
    .expect(Selector('#Layer_0').find('text').exists).notOk()
    .click(Selector('.button.open').nth(1))
    // check layer opening
    .expect(Selector('#Composite_1').visible).ok()
    .expect(Selector('#Layer_0').find('text').visible).ok()
    .click(Selector('.button.open').nth(1)) 
    //check layer closing *** typo in class name
    .expect(Selector('#Composite_1').visible).ok()
    .expect(Selector('#Layer_0').find('text').exists).notOk()
    .click(Selector('.button.open').nth(1))
    .click(Selector('.button.break').nth(1))
    // check layer breaking
    .expect(Selector('#Composite_1').exists).notOk()
    .expect(Selector('#Layer_0').find('text').visible).ok();
});