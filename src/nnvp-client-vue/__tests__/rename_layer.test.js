import { Selector } from 'testcafe';

fixture `Rename Layer`
    .page `http://localhost:8080/`;

test('rename layer test', async t => {
    await t
        .drag(Selector('#layer-template-Input'), 435, 118, {
            offsetX: 101,
            offsetY: 11
        })
        .doubleClick(Selector('#Layer_0').find('text'))
        .typeText(Selector('#textEdited'), 'newName', {
            caretPos: 0
        })
        .pressKey('enter')
        .click(Selector('.isolated'))
        .expect(Selector('#Layer_0').find('text').textContent).eql('newName');
});
