import React from'react';

function Awards(){
    return (
        <div className = 'container mt-5'>
            <div className = 'row'>
                <div className = 'col-6 p-5 mt-3'>
                    <img src ='media/images/largestBroker.svg'/>

                </div>
                <div className = 'col-6 p-5'>
                    <h1>Largest Stock Broker India</h1>
                    <p className ='mb-5'>That's why 1.6+ crore customers trust BlueChip with ~ ₹6 lakh crores of equity investments, making us India’s largest broker; contributing to 15% of daily retail exchange volumes in India.</p>
                    <div className ='row'>
                        <div className='col-6'>
                            <ul>
                                <li>
                                    <p>Future Options</p>
                                </li>
                                <li>
                                    <p>Commodity derivatives</p>
                                </li>
                                <li>
                                    <p>Currency derivatives</p>
                                </li>
                            </ul>
                        </div>
                        <div className='col-6'>
                            <ul>
                                <li>
                                    <p>Stocks & IPOs</p>
                                </li>
                                 <li>
                                    <p>Direct Mutual funds</p>
                                </li>
                                <li>
                                    <p>Bonds and Government Security</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                     <img src ='media/images/pressLogos.png' style ={{width: '90%'}}/>
                        
                        
                    
                    

                </div>


            </div>

        </div>
    );
}
export default Awards;