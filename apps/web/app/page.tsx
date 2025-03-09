import { Heading } from "@radix-ui/themes";
import Uploads from "./uploads/uploads";
import Image from "next/image";
export default function Home() {
  return (
    <div>
      <main>
        <Heading size="8" mt="6" mb="2">
          <Image src="/book-finder-logo.svg" alt="BookFinder" width={62} height={62} />
        </Heading>
        <Uploads />
      </main>
    </div>
  );
}
