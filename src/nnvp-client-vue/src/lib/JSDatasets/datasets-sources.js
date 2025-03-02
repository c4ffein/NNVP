export default (cdnDir) => {return{
  'MNIST': [
    {
      imagesSpritePath: [...Array(14).keys()].map(x =>
        [x * 5000, 5000, cdnDir+"mnist/mnist_"+(x > 9 ? x : "0"+x)+".png"]
      ),
      imagesSpriteChecksum: [
        'sha256-o16u6xjksOJAxvgQbAygLtpw/14gGjRARRkQyyk04zg=',
        'sha256-IsF5SkZw1vnzT35rai4s5yNYn3NSqVcoQ7IASIejiXs=',
        'sha256-akAjzEmktFeaxbcouD5yo5WJFisOe6vnH8bP5wPj0eY=',
        'sha256-cLyGeG9iEEUR748FB8RWY4mZU/f+cTcKEC2hYI5m5Hk=',
        'sha256-OEzJbfQu1g95tjzeG9jrnH44UmgJDmihyTvrCaa0AX0=',
        'sha256-9m2HrQ4sIapkli1ZZuaumvfVMq/fvE4nN2kcUAsnwGU=',
        'sha256-1kfoIwuGQUWDPYql85kQ2Tb5y0WtouMs7P3NsJDFoYM=',
        'sha256-drZTv7ITdbl68k5IJme9+6ipJXZr+Stu1hFeaAk4FwM=',
        'sha256-CGhvkXn/UehFPJJQdkFP0pITP4+T4i/W4dztpd+CF4U=',
        'sha256-BEQgca5EtsAS6pJnNeiJ2BOWpk1JzBhR7pNL4a85BvM=',
        'sha256-ABRjFPt6/SQ6FOLFFmuEl/B4a2kBEfKK7MfRyrU36vA=',
        'sha256-9K/8GvH5JveN32/KkloFQBRi1jwqYela3ABcayb7sXU=',
        'sha256-d+3cJLGncOCHyQHGX1/1RRj2ozC55Ij0SsWRo9LdHvI=',
        'sha256-5GpUNMGVyptW3n5YAQnoWBPSSxufYqzuev+PQNZlSXU=',
      ],
      shape: [28, 28, 1],
      numDatasetElements: 70000,
      numTrainElements: 60000,
      labelsPath: cdnDir+"mnist/mnist_labels_uint8.dms",
      labelsChecksum: "sha256-Zx/51wtIERFtVcPdR576epgeLmJ1Pvem1cFf6oHmPSc=",
    },
    'MNIST database of handwritten digits. ' +
    'Please provide a [28, 28, 1] input shape.',
  ],
  'FashionMNIST': [
    {
      imagesSpritePath: [...Array(14).keys()].map(x =>
        [ x * 5000, 5000, cdnDir+"/fashion_mnist/fashion_mnist_"+(x > 9 ? x : "0"+x)+".png" ]
      ),
      imagesSpriteChecksum: [
        'sha256-dVuwptjsAJXmjU1JQj0Mzhaw2Fs8JoFw557WHpPsZts=',
        'sha256-mGGgsXLNM3dOONO2DX9FvGOhaNe+PvD+4FD5f6kZV44=',
        'sha256-4o4KCw8ir/frQpYnB4yq3XIOoaG4fwf1cgIAnfTFJAQ=',
        'sha256-NcoYZiSrjt+rToPfgir7YhKDLLPbJTpqG+vGwKJJWx4=',
        'sha256-FzOcUfdcpCGvQWCDsU5g9QTO9bOvWbURLifuzrEEpgs=',
        'sha256-XfypRiuSIAy5Rd0IaL/osroDYmHsrMav6NqSBt7N3+w=',
        'sha256-i0tMVCqkS19SUK6NfpWTodm77ya4GtIob9A1GYquOCY=',
        'sha256-mGZexSZ6ljiqkHYPzyyGcsu2+WYsewRBQEhCwTZOmyY=',
        'sha256-cJ29SIljHjCc4/qOByYK8TIBQxEU5tzVSAi6kZkSfgI=',
        'sha256-IpwpScxl50fxXGC5kh3CDh/RuTcRDjLhrqwFgYTY+vg=',
        'sha256-2oeNXcMV6xoZZ0MkrPMz473VChOGFi5olV4fkdWk8tI=',
        'sha256-T9/pjwdKCT8rsm/3vNpovsYe0euJgoXg5DsQa4ULt+k=',
        'sha256-PLfoZfspNCjWTDM2UxzGwjusM3+Hba4EGAE5bnRPJX0=',
        'sha256-7PXEcZF/7V/3hIt9Xq1rxaiw14COSkqLgmyH8OrsAPI=',
      ],
      shape: [28, 28, 1],
      numDatasetElements: 70000,
      numTrainElements: 60000,
      labelsPath: cdnDir+"/fashion_mnist/fashion_mnist_labels_uint8.dms",
      labelsChecksum: "sha256-irlApoBkDzbAvx0lScsvOz1AaMElRxFsx7EWGx0mZj0=",
      labelClassNames: [
        "T-shirt/top",
        "Trouser",
        "Pullover",
        "Dress",
        "Coat",
        "Sandal",
        "Shirt",
        "Sneaker",
        "Bag",
        "Ankle boot",
      ],
    },
    'Dataset of clothes images. Replacement for MNIST as the clothes can be separated in ' +
    '10 categories ' +
    '(T-shirt, Pullover, Dress, Coat, Sandal, Shirt, Sneaker, Bag, Ankle boot). ' +
    'Please provide a [28, 28, 1] input shape.',
  ],
  'CIFAR10': [
    {
      imagesSpritePath: [...Array(30).keys()].map(x =>
        [ x * 2000, 2000, cdnDir+"/cifar10/cifar10_"+(x > 9 ? x : "0"+x)+".png" ]
      ),
      imagesSpriteChecksum: [
        'sha256-QO0+FEL2rAzw7rOUI8WAwOivVLhHGMxom59+oJtcDag=',
        'sha256-cNEyhv7/WeSg0FAwuYb27bnboJUjEgeEkPFXi8fphqw=',
        'sha256-YjjNzceD1av/Oan9ak0rjdSdjj1YD7q9w3MB87IutHg=',
        'sha256-EvbMUYqq0kZCJiJoU942uv7mU228jxLgEs5od0G4JYo=',
        'sha256-wKVEJ/qyrg6v7K01BfZfFTnxUFKf4nsRpBitZfWoYUM=',
        'sha256-prUHmgPLFTpbJ864uFSGB32an70t2YCUWbXUiRdlauI=',
        'sha256-/Za71G6nn4xvnYpkmWSc7IYx9zL/r/s5pI96eDOYnY8=',
        'sha256-y2Prxbl1ckg8A9lI16HwZUUDM6HR7hu0VedqTGVQgVY=',
        'sha256-Wu5ygP9hPrxMEWwbzBxxQJlkX1c0131q94trH/LdM7Y=',
        'sha256-1zWNwQ8wjx5YwL9jkn6d/NQWsndZLKvTU1ysd4H8Oic=',
        'sha256-rMZ3OKEdyx3Xk9Yjhb6T+TnW7yub5Ccjbc/W0FNF6Jw=',
        'sha256-IjMLz86aIQxM9hxEVjHJyLzQa8BhLYYSUhboOzRbWZg=',
        'sha256-ex0pMbROjVq7KPRqAJDxZqy7WgGSYXoUtYQOAahu6fQ=',
        'sha256-5Gnlx0V48gLHPali1HTjf4PGO+L4HCGQms9jHx15I0c=',
        'sha256-/E58wFUNxwMBzdS31rIlb4BuuLz3EpgoefzyStVbR+M=',
        'sha256-dEnCl8CAb8aN/ZLDHgjCRGSAA/Vg2elBEkQl02yxPGg=',
        'sha256-L6BnZIpXgHD46FNILEp4AcMGHKxB9ssQdxb9qKu1IqU=',
        'sha256-7xjg4NASFJKXHFmzq+2r05sWa07rIVfTQYo+DfIz8gI=',
        'sha256-7jGYIiwfACFJnbNQyBqshwxNXeNoL5vI+pK2ZqJsJDA=',
        'sha256-Am6ykPyTjPQc/kjrKl5qCoqRkq1kebdlv92AljJZEgI=',
        'sha256-8QD+D2hymVcMdBkfKpUXJmMRGoU1D+lCtKTls4ci1ZA=',
        'sha256-WWpEBQKHWERZJWX2DGLhqVAMMlckhM2Zij93NE/N+Sk=',
        'sha256-iU6t4YfPysNVAPGIWmB9BS9fIQ8X/F3i6skfTuVbiNI=',
        'sha256-3n4kKe6/WfBzzJncwHtopqIqCHy7TsIo1uAz1PA8t74=',
        'sha256-2lxqr81Eif/RCDcqZja4XOojU0uELPwEu0z1ODsOFcI=',
        'sha256-Hbthz7s+9kiKS6N8bO6L9mwHmozBFvznTY0YTXea6s8=',
        'sha256-H+IHf1TdECzVNx+N6VMM7nWQirkdW96TyNzL6EUH7kE=',
        'sha256-W0KCvm9+kJV1jqYr6b3JV2suOcEZyCcXMnd4ESFX7us=',
        'sha256-3hre9XW0cr3XRTdLcvi42N50ZsxDkDBpbrSvEfsxUH4=',
        'sha256-XP+LRda73NEDqK+BYkSJ8tRgWEXMxRBf+n6HQcFR/Lg=',
      ],
      shape: [32, 32, 3],
      numDatasetElements: 60000,
      numTrainElements: 50000,
      labelsPath: cdnDir+"/cifar10/cifar10_labels_uint8.dms",
      labelsChecksum: "sha256-PttFZSTVkYrv3tgfWu98Mu+rKniCEd+Zik6wyJV7qh8=",
      labelClassNames: [
        "airplane", "automobile", "bird", "cat", "deer", "dog", "frog", "horse", "ship", "truck"
      ],
    },
    'The CIFAR-10 dataset (Canadian Institute For Advanced Research) is a collection of images ' +
    'that are commonly used to train machine learning and computer vision algorithms. ' +
    'The CIFAR-10 dataset contains 60,000 32x32 color images in 10 different classes : ' +
    'airplanes, cars, birds, cats, deer, dogs, frogs, horses, ships, and trucks. ' +
    'Please provide a [32, 32, 3] input shape.',
    'This dataset is particularly heavy for web browsers. Are you sure you want to load it?',
  ],
};};
