import { Selector } from 'testcafe';

fixture`Create Edge and Layer`
    .page`http://localhost:8080/`;


test('create_layer', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 438, 129, {
            offsetX: 119,
            offsetY: 16
        })
        .click(Selector('#Layer_0').find('text'))
        .expect(Selector('#Layer_0').visible).ok();
});

test('create_edge', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 296, 62, {
            offsetX: 134,
            offsetY: 17
        })
        .drag(Selector('#layer-template-Output'), 351, 192, {
            offsetX: 115,
            offsetY: 13
        })
        .click(Selector('#Layer_0').find('.bottom-point'))
        .click(Selector('#s0_t1').find('.link'))
        .expect(Selector('#s0_t1').visible).ok();

});

