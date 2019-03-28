import { Selector } from 'testcafe';

fixture `Save Network`
    .page `http://localhost:8080/`;

test('save network test', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 254, 70, {
            offsetX: 93,
            offsetY: 13
        })
        .drag(Selector('#layer-template-Dense'), 390, 112, {
            offsetX: 170,
            offsetY: 8
        })
        .drag(Selector('#layer-template-Output'), 598, 212, {
            offsetX: 143,
            offsetY: 11
        })
        .click(Selector('#Layer_0').find('.right-point'))
        .click(Selector('#Layer_2').find('.right-point'))
        .click(Selector('#TopBar').find('div').withText('File'))
        .click(Selector('#TopBar').find('div').withText('Save'));
});
