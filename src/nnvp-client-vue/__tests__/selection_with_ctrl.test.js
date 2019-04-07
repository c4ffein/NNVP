import { Selector } from 'testcafe';

fixture`Selection with ctrl`
    .page`http://localhost:8080/`;

test('test', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 348, -12, {
            offsetX: 52,
            offsetY: 13
        })
        .drag(Selector('#layer-template-Output'), 461, -36, {
            offsetX: 81,
            offsetY: 17
        })
        .drag(Selector('#layer-template-Output'), 346, 43, {
            offsetX: 54,
            offsetY: 12
        })
        .drag(Selector('#layer-template-Output'), 509, 54, {
            offsetX: 34,
            offsetY: 8
        })
        .click(Selector('#Layer_0').find('.isolated'), {
            modifiers: {
                ctrl: true
            }
        })
        .expect(Selector('#Layer_0').classNames).contains("selected")
        .click(Selector('#Layer_1').find('text'), {
            modifiers: {
                ctrl: true
            }
        })
        .expect(Selector('#Layer_1').classNames).contains("selected")
        .click(Selector('#Layer_2').find('text'), {
            modifiers: {
                ctrl: true
            }
        })
        .expect(Selector('#Layer_2').classNames).contains("selected")      
        .click(Selector('#Layer_3').find('text'), {
            modifiers: {
                ctrl: true
            }
        })
        .expect(Selector('#Layer_3').classNames).contains("selected");

});
