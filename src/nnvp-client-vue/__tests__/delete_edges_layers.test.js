import { Selector } from 'testcafe';

fixture `Delete Layers And Edges`
    .page `http://localhost:8080/`;

test('Delete_Edges', async t => {
    await t
    .drag(Selector('#layer-template-Input'), 242, 14, {
        offsetX: 121,
        offsetY: 6
    })
    .drag(Selector('#layer-template-Output'), 335, 134, {
        offsetX: 107,
        offsetY: 12
    })
    .drag(Selector('#layer-template-Output'), 435, 234, {
        offsetX: 107,
        offsetY: 12
    })
    .dragToElement(Selector('#Layer_0').find('.bottom-point'), Selector('#Layer_1').find('.top-point'))
    .click(Selector('#whitePage'))
    .dragToElement(Selector('#Layer_0').find('.bottom-point'), Selector('#Layer_2').find('.top-point'))
    .click(Selector('#whitePage'))
    .click(Selector('#s0_t1').find('.link'))
    .pressKey('delete')
    .expect(Selector('#s0_t1').exists).notOk()
    .click(Selector('#s0_t2').find('.link'))
    .pressKey('delete')
    .expect(Selector('#s0_t2').exists).notOk();
});

test('Delete layers', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 272, 3, {
            offsetX: 26,
            offsetY: 15
        })
        .drag(Selector('#layer-template-Output'), 411, -5, {
            offsetX: 82,
            offsetY: 7
        })
        .click(Selector('#Layer_0').find('text'))
        .pressKey('delete')
        .expect(Selector('#Layer_0').exists).notOk()
        .click(Selector('#Layer_1').find('text'))
        .pressKey('delete')
        .expect(Selector('#Layer_0').exists).notOk();
});
