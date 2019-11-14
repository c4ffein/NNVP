export default (cdnDir) => {return{
  'MNIST': [
    {
      imagesSpritePath: [...Array(13).keys()].map(x =>
        [x * 5000, 5000, cdnDir+"/mnist_images/mnist_images_"+(x > 9 ? x : "0"+x)+".png"]
      ),
      imagesSpriteChecksum: [
        "sha256-37NRfDKHRiO6pyvhkZ3I5U4nmHf0AQvVEOEQ0N/8XKQ=",
        "sha256-d9iqhivDgHwCjR637nbsew/DJip4EU7IDxWiI6BwgE0=",
        "sha256-p7nwR7bQdODDTJedgCMss72ePoP6HRcOwD5pR0FCeu8=",
        "sha256-epDSIWwxWfdkJy8d9suuLzufCJGQRegAeCwUrqNwzDo=",
        "sha256-X71s/7K67Cv8/JmcFTJU4iGxuDdLMMw0oJKpsypw5N8=",
        "sha256-bf5mrucQOn2r6lnLfETqGm/2qpsFFG4G6QbGMTkvRJU=",
        "sha256-jM2CAK+mPyZg4qUyJhBQSIZ6H10tfT/4CUupmDymbV4=",
        "sha256-iFts4xo1J+WpiZw27IxBYmnOfOOTfVrUVCTUUm6w1v4=",
        "sha256-i2a0Q067YxxCEoolEkFWClMPNgGtldfLn6GHMQtN1gU=",
        "sha256-geJ1Oy17+8uKnhXZUnJzsM6H8Sh95Uj/5mfUihCd2Xs=",
        "sha256-qSj4+WblnQzv5poRnSLcOCazSV8dBXY0gQQcCmt8vIo=",
        "sha256-TRCq2pj5D73Ru7eGx1VpdpS7wJpDABMbvaYAgiIpVQY=",
        "sha256-CyijOi3x+VOLe8+brXQO1PfQ7asQ1vcxmwXARGUMsx0=",
      ],
      shape: [28, 28, 1],
      numDatasetElements: 65000,
      numTrainElements: 55000,
      labelsPath: cdnDir+"/mnist_images/mnist_labels_uint8.dms",
      labelsChecksum: "sha256-VNu8LKsAUIxa3jaoB/SLyD0O4yhbvriuJTd6qhKyJQw=",
    },
    'MNIST database of handwritten digits. ' +
    'Please provide a [28, 28, 1] input shape.',
  ],
  'FashionMNIST': [
    {
      imagesSpritePath: [...Array(13).keys()].map(x => [
        x * 5000,
        5000,
        cdnDir+"/fashion_mnist_images/fashion_mnist_images_"+(x > 9 ? x : "0"+x)+".png"
      ]),
      imagesSpriteChecksum: [
        "sha256-cns9JKubbiDHs5v21MHynl3vBSGOg6mPSWATG1akQp0=",
        "sha256-n6S3+HRsa/1R4QuvJgsr7Ec+m14Ix4MLAFTwcSBHVnE=",
        "sha256-cpz/i9RHpIvntOKoU7Bn0T/YeW6EFMEuNNgzdnUhJOY=",
        "sha256-iG8xkh3CBh2gr4b3x5p3FkPoAlXuPJE2bbOSGsc3zHk=",
        "sha256-BAWYKU9bv5kcSc4h9NVNkarYieDXIivG2mI7NfZU/NA=",
        "sha256-qB5RuICIEhXVQwnDqT/f03CDesKKRE4m7In1ShvqiWM=",
        "sha256-kewKWz9tEul6YBQMPqVo2UuBl1VxpWp//nGx0cOYvrk=",
        "sha256-ympO4eTs7PMFzi2uJdHAXyFxyG1X/PWmMsnlDHSMGQ8=",
        "sha256-6hh7l1Peq8ZzxX/zovqpA1cmXUOUAZOLCZFMhtF7EkI=",
        "sha256-hZYnBtuAN5ytbrNC/1V15QR0wUO9Q3vcOx61yV3skqw=",
        "sha256-aQDKbMBo8RYzKMMVl7ae68To0tXLxc0BEWNzbIGiofQ=",
        "sha256-VxMrRRKgGLfjsPXaMOPIceIhONe1oXwB+MXFo/rhlto=",
        "sha256-vOB4RqTtH9Q7ykZvp8hMCYf/F5xFcUp/Qq9Ff2jarp8=",
      ],
      shape: [28, 28, 1],
      numDatasetElements: 65000,
      numTrainElements: 55000,
      labelsPath: cdnDir+"/fashion_mnist_images/fashion_mnist_labels_uint8.dms",
      labelsChecksum: "sha256-+2lgsSUwxxX4p0p7bgbI7J3eHpgjkT/xGmFUd9ZV2xo=",
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
      imagesSpritePath: [...Array(60).keys()].map(x => [
         x * 1000, 1000, cdnDir+"/cifar10_images/cifar10_images_"+(x > 9 ? x : "0"+x)+".png"
      ]),
      imagesSpriteChecksum: [
        "sha256-oJA+WYefQcLWAoxzSmaNrfsIssG6FcnEQ7Ow1cLb7ao=",
        "sha256-Sh1cI5yGnbO1BpkNWLcXWEjlthv9DWWyCEKdp2Ke5FA=",
        "sha256-5hMLBEQWkxlMcP/CWT05fXZL++TpmgWlGKcBP5vKapY=",
        "sha256-MccbIbcLnXRYWFjLB8LJ48ocXN3lyAl+Ye3qqfXIy9A=",
        "sha256-xZmZdtDeuG7ygcoTA373FQzI98TBAjoujf7Fr+MckYE=",
        "sha256-uoHVyxSSnMrkpPenKzqHZAbWtNq3nsH3qS8AXepbORI=",
        "sha256-7SAWDfWJedIMyYOiMkUAU4GUehUC53tYJeAecd+NXa4=",
        "sha256-KgZJpbmwGifh2fRAm2hPtkQchlhEYR0Epj3pA1dzcjk=",
        "sha256-Zw9W0ibxtf5nzYCLifU/De6SCpbrtEyjRYYuAu6MysI=",
        "sha256-oGa456gH4tOCxuhCrW1OZqG6qgkxEnv+/++wmFUeLpM=",
        "sha256-iT786fvCa/BComYWwqzL7uwBhr7dw84BlFvEcvqyTA0=",
        "sha256-vjnNMij6Mte5ZYLwsVcreprboLOu2gqxvIh7Lz3xQ34=",
        "sha256-kZRo+XI2oFx7spbfH71EJIIhS1NIjC0nOr5exSbbKGA=",
        "sha256-3mQxHOk8IZbwKRgnVpRvhbfqs2x1UK1x2cXKp4dsh20=",
        "sha256-LBuSTmtlngc+e4Lu84u5Siyf8nknKwy5+w75kLJNh80=",
        "sha256-M+icR2sZdo/5vbTYLIsW6e2Rej9RvoUPkrW137KSKMk=",
        "sha256-hXDWnkc0q4ibqX+Ltg2pZC1fVbfdHZddbtejAll7VLo=",
        "sha256-VeWk6gWlTNMBAy/pvRS/ENO8vqjG/3x61jDyzRz9+5w=",
        "sha256-49itcyCNUWp+hq8JOOMZ1OWIgfX0PmxiBnNrWA+AJ80=",
        "sha256-zrMFGC2sVSQocIhtM/hsCEhNAKA/Ho9+Sa7y2Nx+0AQ=",
        "sha256-/HBXjLR4wWdfsOse2ZkZw1wpqulyT1KSqHN1oe2/zNM=",
        "sha256-Ig/ceMcBL+2l4l+27b58JxQwvPmHWNACuzggs8LIfK8=",
        "sha256-JIQW2Cd6jrN/UceW6DDSlu2vjayBwzl82JHswqeaJoU=",
        "sha256-NR3lQukGpQryVvdDqhrt9yT8z14dvmaGc6B+9S1C+JY=",
        "sha256-7b/5qHmfSheFSbDElrrl55QTdDUnwA2D69J6jty2/AQ=",
        "sha256-H0AKCSaU00/SeRNyGqMk3fIanIaesYzvpT1cqDP40yQ=",
        "sha256-FOgHWnhqR9tPeYyWYkjPauLaNkTDNcNfnJ84USzpLys=",
        "sha256-sCz68JPNYf1a01Xj1GUndFLiKCve8L/oYvcKz2jFX58=",
        "sha256-2N3tYW/7LpQDf6JCKMpj7TRQrIwPP42e8xDkzAYgg0U=",
        "sha256-rWKSGwAGu3/u0cFVapoVyCDnfgzg50jifXbW//zqOWY=",
        "sha256-boGyLgm1DKbDcbB+FmNw8xYeQebmasgTYBQrsQzQ/is=",
        "sha256-FLhM29604dOL2CBpiix+qN+QjrWT1nr0KvF4bdsyZeE=",
        "sha256-R5SrKkrDSYYTvaXnsFI3l5kKfUdNhZIQsnFDgc1WvLw=",
        "sha256-zNiFAmQH8UCY25DuQZjxoeYwXs1wFABW8yUjTC/Urtw=",
        "sha256-QFMWQD+SSocm0N2op9a37JvoLsQWPiWI5vY6zzyj1Js=",
        "sha256-UlRz0L44WPB9EK8VlzD7ZQlZi+F9WPEYZtVSMtWDoxg=",
        "sha256-uHvekeHc8EEv+Arl2zghNfnIT7LB6ecuwvPucg6LARM=",
        "sha256-3R3Y9GC9k4DmBuEqyYYvh1Ki8Eao5aAK9jwPRpJ+tIU=",
        "sha256-NnCjai5T5O1ORQaIMENyMB/IL+YbKM2r2qJ9OlosaVQ=",
        "sha256-WPRVj04VP4C7N5sB04TLz3DN9p1IoZqpVbKsyboYCuI=",
        "sha256-wMQIWzKchxY1xQkKIt6jfRAeEiouoWAk+T3LY0nA4Xc=",
        "sha256-QgBki7MBv2MPOJT+Azd1AWUI3X0412Eh/wRGkfm3Xi4=",
        "sha256-+WiJweOL42f3r7GYcEZOj7Gje3duCOKC4Dh6H5y/nAc=",
        "sha256-yGJZwdbfifEHYFwUbOnC9mZ9fS0umwzaklztK7aprM8=",
        "sha256-pdNmpqMDn7WAkHwDqs+XWyp+uUcveKFhJelKrK+Il7o=",
        "sha256-ylmIqmGIbhq/MftjcXbGxFGfaGfdE7TjUs7ifNA9tY8=",
        "sha256-DJNZnay2H0ATsT9/FJgSkd6/wowVgAW+8LCOrmPaWdo=",
        "sha256-bN20w88Y3GRgJqt+okKRSYUYpD5L2ywXL4F+Ffvr/Y8=",
        "sha256-ADigCMWtqwg8RrLsZ+KbcK71oJCdKIp/hQPusEWNoKI=",
        "sha256-QLDZ5wEfrGPuRQt2YYdefJF3XzZdUvRbzJr8dNAvJp0=",
        "sha256-1lk5jMMoF1dIQZMiKvhj3b3lROLN6v5oWLbV878hT2k=",
        "sha256-lGZTDB4WWfsqxeLvHsGjRBN6EXdv44xvuoBlsVzdphE=",
        "sha256-X4GzJto8Wy7ucWa6CHt+5DxQWzugJl/KQpCUxzQ+ekY=",
        "sha256-wueUqh3KUEU8BJFbMckmaqVFCmoaJcIO5lrU0cj+SAA=",
        "sha256-lg8Sy9o/VI82B1SZwSd6wsdFW8/I5MfOUt5+dFsjxCI=",
        "sha256-/UxHeBa54/cERJbtjXyJQMa1HutjTQTwluK2h/P6zqw=",
        "sha256-pX6BaIfVjQsCXEnp9HAB8g3cXa0T5o2d0YVW70ONVZ4=",
        "sha256-/BEg6myRbG6mMXw5ABgtXZgy+0OdgMxxBdVJrF9/0Uk=",
        "sha256-0zhVQCrCTM4LbXbWnrn74u5EK3ocrwhlYqcv4EDFB/w=",
        "sha256-ndOmQ9tN57brYQI2zZecLrTAll/K7gat89usppZ74Ek=",
      ],
      shape: [32, 32, 3],
      numDatasetElements: 60000,
      numTrainElements: 50000,
      labelsPath: cdnDir+"/cifar10_images/cifar10_labels_uint8.dms",
      labelsChecksum: "sha256-Jje83n5s2qektN4CoT/3D7/0LycweGR6RfXJfYSdvOs=",
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
