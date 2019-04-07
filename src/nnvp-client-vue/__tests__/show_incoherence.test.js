import { Selector } from 'testcafe';

fixture `Incoherence Fixture`
    .page `http://localhost:8080/`;

test('show incoherence test', async t => {
    await t
        .drag(Selector('#layer-template-Conv1D'), 308, -205, {
            offsetX: 96,
            offsetY: 13
        })
        .drag(Selector('#layer-template-Conv2D'), 542, -224, {
            offsetX: 121,
            offsetY: 3
        })
        .click(Selector('#Layer_0').find('.right-point'))
        .click(Selector('#Layer_1').find('text'))
        .click(Selector('.link.linkError'))
        .expect(Selector('.link.linkError').visible).ok();
});
