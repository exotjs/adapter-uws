# uWebSockets.js adapter for Exot

## Usage

```js
import { Exot } from '@exotjs/exot';
import { adapter } from '@exotjs/adapter-uws';

new Exot()
  // mount uWebSockets.js adapter
  .adapter(adapter())

  // add routes
  .get('/', () => 'Hi')

  // bind port
  .listen(3000);
```

## Credits

[uWebSockets.js](https://github.com/uNetworking/uWebSockets.js)

## License

MIT