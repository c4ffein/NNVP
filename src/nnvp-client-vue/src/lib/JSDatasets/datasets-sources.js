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
      labelsPath: cdnDir+"/mnist_images/mnist_labels_uint8.dms",
      labelsChecksum: "sha256-VNu8LKsAUIxa3jaoB/SLyD0O4yhbvriuJTd6qhKyJQw=",
      imageSize: 784,
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
      labelsPath: cdnDir+"/fashion_mnist_images/fashion_mnist_labels_uint8.dms",
      labelsChecksum: "sha256-+2lgsSUwxxX4p0p7bgbI7J3eHpgjkT/xGmFUd9ZV2xo=",
      imageSize: 784,
    },
    'Dataset of clothes images. Replacement for MNIST as the clothes can be separated in ' +
    '10 categories ' +
    '(T-shirt, Pullover, Dress, Coat, Sandal, Shirt, Sneaker, Bag, Ankle boot). ' +
    'Please provide a [28, 28, 1] input shape.',
  ],
};};
