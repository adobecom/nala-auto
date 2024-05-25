import { useState } from 'react';
import { Table, Modal, Button, Tabs, Tab } from 'react-bootstrap';
import ReactCompareImage from 'react-compare-image';
import 'bootstrap/dist/css/bootstrap.min.css';
import ImageTable from './ImageTable';

const HOST = 'https://s3-sj3.corp.adobe.com/milo';

// eslint-disable-next-line react/prop-types
const ImageDiff = ({ data, timestamp }) => {
  const [show, setShow] = useState(false);
  const [leftImage, setLeftImage] = useState('');
  const [rightImage, setRightImage] = useState('');

  const handleClose = () => setShow(false);
  const handleShow = (leftImg, rightImg) => {
    setLeftImage(leftImg);
    setRightImage(rightImg);
    setShow(true);
  };

  const groupByCategorySegment = (data) => {
    return Object.entries(data).reduce((acc, [category, comparisons]) => {
      const segment = category.split('-')[category.split('-').length - 1].trim(); // Get the second segment
      if (!acc[segment]) {
        acc[segment] = [];
      }
      acc[segment].push({ category, comparisons });
      return acc;
    }, {});
  };

  const groupBySegmentDiffNumber = (data) => {
    return Object.entries(data).reduce((acc, [category, comparisons]) => {
      const segments = category.split('-');
      const segment = segments[segments.length - 1].trim(); // Get the second segment
      
      if (!acc[segment]) {
        acc[segment] = 0;
      }
      
      const diffNumber = comparisons.reduce((count, item) => item.diff ? count + 1 : count, 0);
      
      acc[segment] += diffNumber;
      return acc;
    }, {});
  };
  

  // Group data
  const groupedData = groupByCategorySegment(data);
  const groupDiffNumber = groupBySegmentDiffNumber(data);

  return (
    <div>
      <div className='text-xl m-3 text-blue-600'>Report Time: {timestamp}</div>
      <div className='text-lg m-3 text-red-600'>Notes: a number specifies how many different images there are per device.</div>
      <Tabs defaultActiveKey={Object.keys(groupedData)[0]} className="mb-3">
        {Object.entries(groupedData).map(([segment, items], idx) => (
          <Tab eventKey={`tab-${segment}`} title={`${segment}(${groupDiffNumber[segment]})`} key={idx}>
            {items.map(({ category, comparisons }, index) => (
              <div key={index}>
                <h3>{index} - {category} [{comparisons[0].urls}]</h3>
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Stable</th>
                      <th>Beta</th>
                      <th>Diff</th>
                      <th>Slider</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((item, index) => (
                      <tr key={index}>
                        <td>{item.order}</td>
                        <ImageTable HOST={HOST} item={item} handleShow={handleShow} />
                        <td>
                          <Button variant="primary" onClick={() => handleShow(`${HOST}/${item.a}`, `${HOST}/${item.b}`)}>Compare Images</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ))}
          </Tab>
        ))}
      </Tabs>

      <Modal size='xl' show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Image Preview</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {rightImage ? (
            <ReactCompareImage leftImage={leftImage} rightImage={rightImage} />
          ) : (
            <img src={leftImage} alt="Preview" style={{ width: "100%" }} />
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ImageDiff;
