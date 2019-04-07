import { Selector } from 'testcafe';

fixture `Layer Parameters`
    .page `localhost:8080`;

test('layer parameters test', async t => {
    await t
        .drag(Selector('#layer-template-Conv1D'), 457, -226, {
            offsetX: 101,
            offsetY: 15
        })
        .click(Selector('#Layer_0').find('text'))
        .click(Selector('span').withText('kernel').find('input'))
        .typeText(Selector('span').withText('strides').find('input'), '5')
        .expect(Selector('span').withText('strides').find('input').value).eql('05')
        .typeText(Selector('span').withText('dilation').find('input'), '25')
        .expect(Selector('span').withText('dilation').find('input').value).eql('025')
});
