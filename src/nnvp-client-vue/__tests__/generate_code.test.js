import { Selector } from 'testcafe';

fixture `Generate Code`
    .page `http://localhost:8080/`;

test('generating code test', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 184, 66, {
            offsetX: 132,
            offsetY: 13
        })
        .drag(Selector('#layer-template-Dense'), 396, 69, {
            offsetX: 144,
            offsetY: 9
        })
        .drag(Selector('#layer-template-Output'), 532, 158, {
            offsetX: 164,
            offsetY: 13
        })
        .click(Selector('#Layer_0').find('.right-point'))
        .click(Selector('#Layer_2').find('.right-point'))
        .click(Selector('#TopBar').find('div').withText('File'))
        .click(Selector('#TopBar').find('div').withText('Generate'));
        
});
